const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Bottle = require('../models/Bottle');
const { BOTTLE_PRICES, getBottlePrice, getAllBottlePrices } = require('../constants/bottlePrices');
const { isAuthenticated } = require('../middleware/auth');
const moment = require('moment');

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// Get all orders (with pagination and filters)
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        
        const filters = {
            search: req.query.search || '',
            order_status: req.query.order_status || '',
            order_type: req.query.order_type || '',
            bottle_type: req.query.bottle_type || '',
            customer_id: req.query.customer_id || ''
        };

        const result = await Order.getAll(page, limit, filters);
        
        res.render('orders/index', {
            title: 'Order Management',
            orders: result.orders,
            pagination: result.pagination,
            currentPage: page,
            filters,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        req.flash('error', 'Failed to load orders');
        res.redirect('/dashboard');
    }
});

// Show add order form
router.get('/add', async (req, res) => {
    try {
        // Get customer from query parameter if provided
        let selectedCustomer = null;
        if (req.query.customer_id) {
            selectedCustomer = await Customer.getById(req.query.customer_id);
        }

        res.render('orders/add-order', {
            title: 'Create New Order',
            selectedCustomer,
            bottlePrices: BOTTLE_PRICES,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Error loading add order form:', error);
        req.flash('error', 'Failed to load order form');
        res.redirect('/orders');
    }
});

// Create new order
router.post('/add', async (req, res) => {
    try {
        // Parse custom delivery dates if provided
        let customDeliveryDates = null;
        if (req.body.subscription_type === 'custom-dates' && req.body.custom_delivery_dates) {
            try {
                // Handle both comma-separated string and array formats
                const datesInput = req.body.custom_delivery_dates;
                if (typeof datesInput === 'string') {
                    customDeliveryDates = datesInput.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 31);
                } else if (Array.isArray(datesInput)) {
                    customDeliveryDates = datesInput.map(d => parseInt(d)).filter(d => d >= 1 && d <= 31);
                }
                
                if (!customDeliveryDates || customDeliveryDates.length === 0) {
                    throw new Error('Invalid custom delivery dates');
                }
            } catch (error) {
                req.flash('error', 'Please provide valid custom delivery dates (1-31)');
                return res.redirect('/orders/add');
            }
        }

        const orderData = {
            customer_id: req.body.customer_id,
            order_type: req.body.order_type,
            subscription_type: req.body.subscription_type,
            custom_delivery_dates: customDeliveryDates,
            bottle_type: req.body.bottle_type,
            quantity_per_delivery: req.body.quantity_per_delivery,
            total_bottles_ordered: req.body.total_bottles_ordered,
            unit_price: req.body.unit_price,
            start_date: req.body.start_date,
            end_date: req.body.end_date,
            delivery_address: req.body.delivery_address?.trim(),
            delivery_instructions: req.body.delivery_instructions?.trim(),
            priority_level: req.body.priority_level || 'normal',
            order_status: req.body.order_status || 'pending',
            notes: req.body.notes?.trim()
        };

        const newOrder = await Order.create(orderData, req.user.id);
        req.flash('success', `Order ${newOrder.order_number} created successfully`);
        res.redirect(`/orders/${newOrder.id}`);
    } catch (error) {
        console.error('Error creating order:', error);
        req.flash('error', error.message || 'Failed to create order');
        res.redirect('/orders/add');
    }
});

// Show order details
router.get('/:id', async (req, res) => {
    try {
        const order = await Order.getById(req.params.id);
        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }

        // Get delivery history for this order
        const { pool } = require('../models/database');
        const deliveryHistory = await pool.query(`
            SELECT * FROM deliveries 
            WHERE order_id = $1 
            ORDER BY delivered_date DESC, created_at DESC
        `, [req.params.id]);

        // Get order history
        const orderHistory = await pool.query(`
            SELECT oh.*, u.email as changed_by_email
            FROM order_history oh
            LEFT JOIN users u ON oh.changed_by = u.id
            WHERE oh.order_id = $1 
            ORDER BY oh.changed_at DESC
        `, [req.params.id]);

        // Get related orders from the same customer
        const relatedOrdersQuery = await pool.query(`
            SELECT o.id, o.order_number, o.bottle_type, o.order_status, o.total_amount, o.created_at
            FROM orders o
            WHERE o.customer_id = $1 AND o.id != $2
            ORDER BY o.created_at DESC
            LIMIT 5
        `, [order.customer_id, req.params.id]);

        res.render('orders/detail', {
            title: `Order Details - ${order.order_number}`,
            order,
            deliveries: deliveryHistory.rows,
            history: orderHistory.rows,
            relatedOrders: relatedOrdersQuery.rows,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        req.flash('error', 'Failed to load order details');
        res.redirect('/orders');
    }
});

// Show edit order form
router.get('/:id/edit', async (req, res) => {
    try {
        const order = await Order.getById(req.params.id);
        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }

        // Don't allow editing completed or cancelled orders
        if (order.order_status === 'completed' || order.order_status === 'cancelled') {
            req.flash('error', 'Cannot edit completed or cancelled orders');
            return res.redirect(`/orders/${order.id}`);
        }

        res.render('orders/edit-order', {
            title: `Edit Order - ${order.order_number}`,
            order,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Error fetching order for edit:', error);
        req.flash('error', 'Failed to load order');
        res.redirect('/orders');
    }
});

// Update order
router.post('/:id/edit', async (req, res) => {
    try {
        // Get current order to check if it can be edited
        const currentOrder = await Order.getById(req.params.id);
        if (!currentOrder) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }

        if (currentOrder.order_status === 'completed' || currentOrder.order_status === 'cancelled') {
            req.flash('error', 'Cannot edit completed or cancelled orders');
            return res.redirect(`/orders/${req.params.id}`);
        }

        const { pool } = require('../models/database');
        
        // Calculate total amount if quantity or price changed
        const quantity = req.body.quantity_per_delivery ? parseInt(req.body.quantity_per_delivery) : currentOrder.quantity_per_delivery;
        const unitPrice = req.body.unit_price ? parseFloat(req.body.unit_price) : currentOrder.unit_price;
        const totalBottles = req.body.total_bottles_ordered ? parseInt(req.body.total_bottles_ordered) : currentOrder.total_bottles_ordered;
        const totalAmount = quantity * unitPrice * (totalBottles || 1);
        
        const updateQuery = `
            UPDATE orders SET 
                order_status = COALESCE($1, order_status),
                quantity_per_delivery = COALESCE($2, quantity_per_delivery),
                unit_price = COALESCE($3, unit_price),
                total_amount = COALESCE($4, total_amount),
                start_date = COALESCE($5, start_date),
                end_date = COALESCE($6, end_date),
                total_bottles_ordered = COALESCE($7, total_bottles_ordered),
                next_delivery_date = COALESCE($8, next_delivery_date),
                delivery_address = COALESCE($9, delivery_address),
                delivery_instructions = COALESCE($10, delivery_instructions),
                priority_level = COALESCE($11, priority_level),
                notes = COALESCE($12, notes),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $13
            RETURNING *
        `;

        const values = [
            req.body.status || null,  // This will be mapped to order_status in the query
            quantity,
            unitPrice,
            totalAmount,
            req.body.start_date || null,
            req.body.end_date || null,
            totalBottles,
            req.body.next_delivery_date || null,
            req.body.delivery_address?.trim(),
            req.body.delivery_instructions?.trim(),
            req.body.priority_level,
            req.body.notes?.trim(),
            req.params.id
        ];

        await pool.query(updateQuery, values);

        // Log the update
        await pool.query(`
            INSERT INTO order_history (order_id, action_type, details, changed_by)
            VALUES ($1, $2, $3, $4)
        `, [req.params.id, 'updated', 'Order details updated', req.user.id]);

        req.flash('success', 'Order updated successfully');
        res.redirect(`/orders/${req.params.id}`);
    } catch (error) {
        console.error('Error updating order:', error);
        req.flash('error', error.message || 'Failed to update order');
        res.redirect(`/orders/${req.params.id}/edit`);
    }
});

// Update order status (AJAX endpoint)
router.post('/:id/status', async (req, res) => {
    try {
        const { status, reason } = req.body;
        
        const updatedOrder = await Order.updateStatus(req.params.id, status, req.user.id, reason);
        
        res.json({
            success: true,
            order_status: updatedOrder.order_status,
            message: `Order status updated to ${status}`
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to update order status' 
        });
    }
});

// Get delivery schedule
router.get('/schedule/delivery', async (req, res) => {
    try {
        // Include overdue orders by starting from a week ago
        const startDate = req.query.start_date || moment().subtract(7, 'days').format('YYYY-MM-DD');
        const endDate = req.query.end_date || moment().add(7, 'days').format('YYYY-MM-DD');

        const deliverySchedule = await Order.getDeliverySchedule(startDate, endDate);
        
        // Categorize deliveries
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const weekFromNow = new Date(today);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        
        const todayDeliveries = deliverySchedule.filter(d => 
            new Date(d.next_delivery_date).toDateString() === today.toDateString()
        );
        
        const tomorrowDeliveries = deliverySchedule.filter(d => 
            new Date(d.next_delivery_date).toDateString() === tomorrow.toDateString()
        );
        
        const weekDeliveries = deliverySchedule.filter(d => {
            const deliveryDate = new Date(d.next_delivery_date);
            return deliveryDate >= today && deliveryDate <= weekFromNow;
        });
        
        const overdueDeliveries = deliverySchedule.filter(d => 
            new Date(d.next_delivery_date) < today
        );
        
        res.render('orders/delivery-schedule', {
            title: 'Delivery Schedule',
            allDeliveries: deliverySchedule,
            todayDeliveries,
            tomorrowDeliveries,
            weekDeliveries,
            overdueDeliveries,
            startDate,
            endDate,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Error fetching delivery schedule:', error);
        req.flash('error', 'Failed to load delivery schedule');
        res.redirect('/orders');
    }
});

// Get orders due for delivery (AJAX endpoint)
router.get('/api/due-today', async (req, res) => {
    try {
        const date = req.query.date || moment().format('YYYY-MM-DD');
        const orders = await Order.getDueForDelivery(date);
        
        res.json({
            date,
            orders: orders.map(order => ({
                id: order.id,
                order_number: order.order_number,
                customer_name: order.customer_name,
                customer_code: order.customer_code,
                customer_phone: order.customer_phone,
                customer_address: order.delivery_address || 'Default address',
                bottle_type: order.bottle_type,
                quantity_per_delivery: order.quantity_per_delivery,
                priority_level: order.priority_level,
                next_delivery_date: order.next_delivery_date,
                delivery_address: order.delivery_address
            }))
        });
    } catch (error) {
        console.error('Error fetching due orders:', error);
        res.status(500).json({ error: 'Failed to fetch due orders' });
    }
});

// Get order statistics (AJAX endpoint)
router.get('/api/stats', async (req, res) => {
    try {
        const stats = await Order.getStatistics();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching order statistics:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Bulk status update
router.post('/bulk/status', async (req, res) => {
    try {
        const { order_ids, new_status, reason } = req.body;
        
        if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
            return res.status(400).json({ error: 'No orders selected' });
        }

        const results = [];
        for (const orderId of order_ids) {
            try {
                const updatedOrder = await Order.updateStatus(orderId, new_status, req.user.id, reason);
                results.push({ id: orderId, success: true, order_number: updatedOrder.order_number });
            } catch (error) {
                results.push({ id: orderId, success: false, error: error.message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        res.json({
            success: true,
            message: `${successCount} orders updated successfully${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
            results
        });
    } catch (error) {
        console.error('Error in bulk status update:', error);
        res.status(500).json({ error: 'Failed to update orders' });
    }
});

// Get delivery routes
router.get('/routes', async (req, res) => {
    try {
        // Mock route data - in a real app this would come from a routes table
        const routes = [];
        const filters = {
            date: req.query.date || '',
            status: req.query.status || '',
            vehicle: req.query.vehicle || '',
            area: req.query.area || ''
        };
        const vehicles = []; // Mock data - would be from vehicles table
        
        res.render('orders/delivery-routes', {
            title: 'Delivery Routes',
            routes,
            filters,
            vehicles,
            totalDeliveries: 0,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Error fetching delivery routes:', error);
        req.flash('error', 'Failed to load delivery routes');
        res.redirect('/orders');
    }
});

// Generate delivery route optimization (basic algorithm)
router.get('/delivery/optimize', async (req, res) => {
    try {
        const date = req.query.date || moment().format('YYYY-MM-DD');
        const orders = await Order.getDueForDelivery(date);
        
        // Group orders by city for basic route optimization
        const routeGroups = {};
        orders.forEach(order => {
            const city = order.city || 'Unknown';
            if (!routeGroups[city]) {
                routeGroups[city] = [];
            }
            routeGroups[city].push(order);
        });

        // Sort by priority within each city
        Object.keys(routeGroups).forEach(city => {
            routeGroups[city].sort((a, b) => {
                const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
                return priorityOrder[b.priority_level] - priorityOrder[a.priority_level];
            });
        });

        res.render('orders/delivery-routes', {
            title: `Delivery Routes - ${moment(date).format('MMMM Do, YYYY')}`,
            routes: [], // Mock data - would be actual routes from database
            filters: {
                date: req.query.date || '',
                status: req.query.status || '',
                vehicle: req.query.vehicle || '',
                area: req.query.area || ''
            },
            vehicles: [], // Mock data - would be from vehicles table
            totalDeliveries: orders.length,
            routeGroups,
            date,
            totalOrders: orders.length,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Error optimizing delivery routes:', error);
        req.flash('error', 'Failed to optimize delivery routes');
        res.redirect('/orders');
    }
});

// Get upcoming custom delivery dates (AJAX endpoint)
router.get('/api/custom-dates/preview', async (req, res) => {
    try {
        const { start_date, end_date, custom_dates } = req.query;
        
        if (!start_date || !end_date || !custom_dates) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // Parse custom dates
        const dates = custom_dates.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 31);
        
        if (dates.length === 0) {
            return res.status(400).json({ error: 'No valid dates provided' });
        }

        // Generate delivery dates
        const deliveryDates = Order.generateCustomDeliveryDates(start_date, end_date, dates);
        
        res.json({
            success: true,
            delivery_dates: deliveryDates,
            total_deliveries: deliveryDates.length,
            selected_days: dates.sort((a, b) => a - b)
        });
    } catch (error) {
        console.error('Error previewing custom dates:', error);
        res.status(500).json({ error: 'Failed to preview custom dates' });
    }
});

// Get next delivery date for custom schedule (AJAX endpoint)
router.get('/api/custom-dates/next', async (req, res) => {
    try {
        const { current_date, custom_dates } = req.query;
        
        if (!current_date || !custom_dates) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const dates = custom_dates.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 31);
        const nextDate = Order.calculateNextCustomDate(current_date, dates);
        
        res.json({
            success: true,
            next_delivery_date: nextDate,
            selected_days: dates.sort((a, b) => a - b)
        });
    } catch (error) {
        console.error('Error calculating next custom date:', error);
        res.status(500).json({ error: 'Failed to calculate next date' });
    }
});

// Export orders to CSV
router.get('/export/csv', async (req, res) => {
    try {
        const filters = {
            order_status: req.query.order_status || '',
            order_type: req.query.order_type || '',
            bottle_type: req.query.bottle_type || ''
        };

        const result = await Order.getAll(1, 1000, filters); // Get up to 1000 orders for export
        const orders = result.orders;

        // Set CSV headers
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=orders_export.csv');

        // CSV header
        let csvContent = 'Order Number,Customer Name,Customer Code,Order Type,Subscription Type,Bottle Type,Quantity Per Delivery,Total Bottles,Bottles Delivered,Bottles Remaining,Unit Price,Total Amount,Order Status,Payment Status,Start Date,Next Delivery,Created Date\n';

        // CSV data
        orders.forEach(order => {
            csvContent += [
                order.order_number,
                `"${order.customer_name || ''}"`,
                order.customer_code || '',
                order.order_type,
                order.subscription_type || '',
                order.bottle_type,
                order.quantity_per_delivery,
                order.total_bottles_ordered,
                order.bottles_delivered,
                order.bottles_remaining,
                order.unit_price,
                order.total_amount,
                order.order_status,
                order.payment_status,
                moment(order.start_date).format('YYYY-MM-DD'),
                order.next_delivery_date ? moment(order.next_delivery_date).format('YYYY-MM-DD') : '',
                moment(order.created_at).format('YYYY-MM-DD HH:mm')
            ].join(',') + '\n';
        });

        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting orders:', error);
        req.flash('error', 'Failed to export orders');
        res.redirect('/orders');
    }
});

// Get bottle prices (AJAX endpoint)
router.get('/api/bottle-prices', async (req, res) => {
    try {
        res.json({
            success: true,
            prices: BOTTLE_PRICES,
            list: getAllBottlePrices()
        });
    } catch (error) {
        console.error('Error fetching bottle prices:', error);
        res.status(500).json({ error: 'Failed to fetch bottle prices' });
    }
});

module.exports = router;
