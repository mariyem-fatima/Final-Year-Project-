const { pool } = require('./database');
const moment = require('moment');

class Order {
    constructor(data) {
        this.id = data.id;
        this.order_number = data.order_number;
        this.customer_id = data.customer_id;
        this.order_type = data.order_type;
        this.subscription_type = data.subscription_type;
        this.custom_delivery_dates = data.custom_delivery_dates;
        this.bottle_type = data.bottle_type;
        this.quantity_per_delivery = data.quantity_per_delivery;
        this.total_bottles_ordered = data.total_bottles_ordered;
        this.bottles_delivered = data.bottles_delivered || 0;
        this.bottles_remaining = data.bottles_remaining;
        this.unit_price = data.unit_price;
        this.total_amount = data.total_amount;
        this.order_status = data.order_status || 'pending';
        this.payment_status = data.payment_status || 'pending';
        this.start_date = data.start_date;
        this.end_date = data.end_date;
        this.next_delivery_date = data.next_delivery_date;
        this.last_delivery_date = data.last_delivery_date;
        this.delivery_address = data.delivery_address;
        this.delivery_instructions = data.delivery_instructions;
        this.priority_level = data.priority_level || 'normal';
        this.created_by = data.created_by;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
        this.notes = data.notes;
        
        // Joined fields
        this.customer_name = data.customer_name;
        this.customer_code = data.customer_code;
        this.customer_phone = data.customer_phone;
    }

    // Generate unique order number
    static async generateOrderNumber() {
        const prefix = 'ORD';
        const date = moment().format('YYMMDD');
        const query = 'SELECT order_number FROM orders WHERE order_number LIKE $1 ORDER BY order_number DESC LIMIT 1';
        const result = await pool.query(query, [`${prefix}${date}%`]);
        
        let nextNumber = 1;
        if (result.rows.length > 0) {
            const lastOrderNumber = result.rows[0].order_number;
            const lastNumber = parseInt(lastOrderNumber.substring(9));
            nextNumber = lastNumber + 1;
        }
        
        return `${prefix}${date}${String(nextNumber).padStart(3, '0')}`;
    }

    // Calculate next delivery date based on subscription type
    static calculateNextDeliveryDate(startDate, subscriptionType, lastDeliveryDate = null, customDates = null) {
        const baseDate = lastDeliveryDate ? moment(lastDeliveryDate) : moment(startDate);
        
        switch (subscriptionType) {
            case 'monthly':
                return baseDate.add(1, 'month').format('YYYY-MM-DD');
            case 'parallel-1day':
                return baseDate.add(1, 'day').format('YYYY-MM-DD');
            case 'parallel-2day':
                return baseDate.add(2, 'days').format('YYYY-MM-DD');
            case 'parallel-3day':
                return baseDate.add(3, 'days').format('YYYY-MM-DD');
            case 'custom-dates':
                return this.calculateNextCustomDate(baseDate, customDates);
            default:
                return null; // For on-demand orders
        }
    }

    // Calculate next delivery date for custom date selection
    static calculateNextCustomDate(currentDate, customDates) {
        if (!customDates || customDates.length === 0) {
            return null;
        }

        const dates = Array.isArray(customDates) ? customDates : JSON.parse(customDates);
        const currentMoment = moment(currentDate);
        const currentDay = currentMoment.date();
        const currentMonth = currentMoment.month();
        const currentYear = currentMoment.year();

        // Sort dates in ascending order
        const sortedDates = dates.sort((a, b) => a - b);

        // Find next date in current month
        let nextDate = sortedDates.find(date => date > currentDay);
        
        if (nextDate) {
            // Next date is in current month
            return moment([currentYear, currentMonth, nextDate]).format('YYYY-MM-DD');
        } else {
            // Use first date of next month
            const nextMonth = currentMoment.clone().add(1, 'month');
            return moment([nextMonth.year(), nextMonth.month(), sortedDates[0]]).format('YYYY-MM-DD');
        }
    }

    // Generate all custom delivery dates for a date range
    static generateCustomDeliveryDates(startDate, endDate, customDates) {
        if (!customDates || customDates.length === 0) {
            return [];
        }

        const dates = Array.isArray(customDates) ? customDates : JSON.parse(customDates);
        const deliveryDates = [];
        
        const start = moment(startDate);
        const end = moment(endDate);
        
        let currentMonth = start.clone().startOf('month');
        
        while (currentMonth.isSameOrBefore(end, 'month')) {
            dates.forEach(day => {
                const deliveryDate = currentMonth.clone().date(day);
                
                // Only include dates within the range and not in the past
                if (deliveryDate.isSameOrAfter(start) && deliveryDate.isSameOrBefore(end)) {
                    deliveryDates.push(deliveryDate.format('YYYY-MM-DD'));
                }
            });
            
            currentMonth.add(1, 'month');
        }
        
        return deliveryDates.sort();
    }

    // Validate custom dates
    static validateCustomDates(customDates) {
        if (!customDates) return true;
        
        const dates = Array.isArray(customDates) ? customDates : JSON.parse(customDates);
        
        // Check if all dates are valid (1-31)
        return dates.every(date => {
            const num = parseInt(date);
            return num >= 1 && num <= 31;
        });
    }

    // Calculate bottles remaining
    static calculateBottlesRemaining(totalOrdered, delivered) {
        return Math.max(0, totalOrdered - delivered);
    }

    // Create new order
    static async create(orderData, userId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Validate required fields
            if (!orderData.customer_id || !orderData.bottle_type || !orderData.quantity_per_delivery || !orderData.unit_price || !orderData.start_date) {
                throw new Error('Required fields missing: customer_id, bottle_type, quantity_per_delivery, unit_price, start_date');
            }

            // Generate order number
            const order_number = await this.generateOrderNumber();

            // Validate custom dates if provided
            if (orderData.subscription_type === 'custom-dates' && orderData.custom_delivery_dates) {
                if (!this.validateCustomDates(orderData.custom_delivery_dates)) {
                    throw new Error('Invalid custom delivery dates. Dates must be between 1 and 31.');
                }
            }

            // Calculate totals for subscription orders
            let total_bottles_ordered = orderData.total_bottles_ordered;
            if (orderData.order_type === 'subscription' && !total_bottles_ordered) {
                // For subscriptions without specified total, calculate based on duration
                const startDate = moment(orderData.start_date);
                const endDate = orderData.end_date ? moment(orderData.end_date) : startDate.clone().add(1, 'month');
                
                let deliveryCount = 1;
                switch (orderData.subscription_type) {
                    case 'monthly':
                        deliveryCount = endDate.diff(startDate, 'months') + 1;
                        break;
                    case 'parallel-1day':
                        deliveryCount = endDate.diff(startDate, 'days') + 1;
                        break;
                    case 'parallel-2day':
                        deliveryCount = Math.ceil(endDate.diff(startDate, 'days') / 2);
                        break;
                    case 'parallel-3day':
                        deliveryCount = Math.ceil(endDate.diff(startDate, 'days') / 3);
                        break;
                    case 'custom-dates':
                        if (orderData.custom_delivery_dates) {
                            const customDates = this.generateCustomDeliveryDates(
                                orderData.start_date, 
                                orderData.end_date || startDate.clone().add(1, 'month').format('YYYY-MM-DD'), 
                                orderData.custom_delivery_dates
                            );
                            deliveryCount = customDates.length;
                        }
                        break;
                }
                total_bottles_ordered = orderData.quantity_per_delivery * deliveryCount;
            } else if (orderData.order_type === 'on-demand') {
                total_bottles_ordered = orderData.quantity_per_delivery;
            }

            const total_amount = total_bottles_ordered * parseFloat(orderData.unit_price);
            const bottles_remaining = total_bottles_ordered;

            // Calculate next delivery date
            const next_delivery_date = orderData.order_type === 'subscription' 
                ? this.calculateNextDeliveryDate(orderData.start_date, orderData.subscription_type, null, orderData.custom_delivery_dates)
                : orderData.start_date;

            const query = `
                INSERT INTO orders (
                    order_number, customer_id, order_type, subscription_type, bottle_type,
                    quantity_per_delivery, total_bottles_ordered, bottles_remaining,
                    unit_price, total_amount, order_status, start_date, end_date, next_delivery_date,
                    delivery_address, delivery_instructions, priority_level, custom_delivery_dates,
                    created_by, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                RETURNING *
            `;

            const values = [
                order_number,
                orderData.customer_id,
                orderData.order_type,
                orderData.subscription_type || null,
                orderData.bottle_type,
                parseInt(orderData.quantity_per_delivery),
                total_bottles_ordered,
                bottles_remaining,
                parseFloat(orderData.unit_price),
                total_amount,
                orderData.order_status || 'pending',
                orderData.start_date,
                orderData.end_date || null,
                next_delivery_date,
                orderData.delivery_address || null,
                orderData.delivery_instructions || null,
                orderData.priority_level || 'normal',
                orderData.custom_delivery_dates ? JSON.stringify(orderData.custom_delivery_dates) : null,
                userId,
                orderData.notes || null
            ];

            const result = await client.query(query, values);
            const newOrder = result.rows[0];

            // Log order creation in history
            await client.query(`
                INSERT INTO order_history (order_id, action_type, new_status, details, changed_by)
                VALUES ($1, $2, $3, $4, $5)
            `, [newOrder.id, 'created', 'pending', 'Order created', userId]);

            await client.query('COMMIT');
            return new Order(newOrder);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all orders with pagination and filters
    static async getAll(page = 1, limit = 20, filters = {}) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE 1=1';
            const params = [];
            let paramCount = 0;

            if (filters.search) {
                paramCount++;
                whereClause += ` AND (
                    o.order_number ILIKE $${paramCount} OR 
                    c.full_name ILIKE $${paramCount} OR 
                    c.customer_code ILIKE $${paramCount}
                )`;
                params.push(`%${filters.search}%`);
            }

            if (filters.order_status) {
                paramCount++;
                whereClause += ` AND o.order_status = $${paramCount}`;
                params.push(filters.order_status);
            }

            if (filters.order_type) {
                paramCount++;
                whereClause += ` AND o.order_type = $${paramCount}`;
                params.push(filters.order_type);
            }

            if (filters.bottle_type) {
                paramCount++;
                whereClause += ` AND o.bottle_type = $${paramCount}`;
                params.push(filters.bottle_type);
            }

            if (filters.customer_id) {
                paramCount++;
                whereClause += ` AND o.customer_id = $${paramCount}`;
                params.push(filters.customer_id);
            }

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total 
                FROM orders o
                LEFT JOIN customers c ON o.customer_id = c.id
                ${whereClause}
            `;
            const countResult = await pool.query(countQuery, params);
            const total = parseInt(countResult.rows[0].total);

            // Get orders
            const query = `
                SELECT o.*, c.full_name as customer_name, c.customer_code, c.phone_primary as customer_phone,
                       u.email as created_by_email
                FROM orders o
                LEFT JOIN customers c ON o.customer_id = c.id
                LEFT JOIN users u ON o.created_by = u.id
                ${whereClause}
                ORDER BY o.created_at DESC
                LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
            `;

            params.push(limit, offset);
            const result = await pool.query(query, params);

            return {
                orders: result.rows.map(row => new Order(row)),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            throw error;
        }
    }

    // Get order by ID
    static async getById(id) {
        try {
            const query = `
                SELECT o.*, c.full_name as customer_name, c.customer_code, c.phone_primary as customer_phone,
                       c.address_line1, c.city, u.email as created_by_email
                FROM orders o
                LEFT JOIN customers c ON o.customer_id = c.id
                LEFT JOIN users u ON o.created_by = u.id
                WHERE o.id = $1
            `;

            const result = await pool.query(query, [id]);
            
            if (result.rows.length === 0) {
                return null;
            }

            return new Order(result.rows[0]);
        } catch (error) {
            throw error;
        }
    }

    // Get orders due for delivery
    static async getDueForDelivery(date = null) {
        try {
            const targetDate = date || moment().format('YYYY-MM-DD');
            
            const query = `
                SELECT o.*, c.full_name as customer_name, c.customer_code, c.phone_primary as customer_phone
                FROM orders o
                LEFT JOIN customers c ON o.customer_id = c.id
                WHERE o.next_delivery_date <= $1 
                AND o.order_status IN ('pending', 'confirmed', 'in-progress')
                AND o.bottles_remaining > 0
                ORDER BY o.priority_level DESC, o.next_delivery_date ASC
            `;

            const result = await pool.query(query, [targetDate]);
            return result.rows.map(row => new Order(row));
        } catch (error) {
            throw error;
        }
    }

    // Update order status
    static async updateStatus(id, newStatus, userId, reason = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get current status
            const currentOrder = await client.query('SELECT order_status FROM orders WHERE id = $1', [id]);
            if (currentOrder.rows.length === 0) {
                throw new Error('Order not found');
            }

            const previousStatus = currentOrder.rows[0].order_status;

            // Update order
            const updateQuery = `
                UPDATE orders SET 
                    order_status = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `;

            const result = await client.query(updateQuery, [newStatus, id]);

            // Log status change
            await client.query(`
                INSERT INTO order_history (order_id, action_type, previous_status, new_status, details, changed_by)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [id, 'status_change', previousStatus, newStatus, reason || `Status changed to ${newStatus}`, userId]);

            await client.query('COMMIT');
            return new Order(result.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Record delivery
    static async recordDelivery(orderId, deliveryData, userId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update order delivery counts
            const updateOrderQuery = `
                UPDATE orders SET 
                    bottles_delivered = bottles_delivered + $1,
                    bottles_remaining = bottles_remaining - $1,
                    last_delivery_date = $2,
                    next_delivery_date = $3,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
                RETURNING *
            `;

            // Calculate next delivery date for subscriptions
            const order = await this.getById(orderId);
            const nextDeliveryDate = order.order_type === 'subscription' 
                ? this.calculateNextDeliveryDate(order.start_date, order.subscription_type, deliveryData.delivered_date, order.custom_delivery_dates)
                : null;

            const orderResult = await client.query(updateOrderQuery, [
                deliveryData.quantity_delivered,
                deliveryData.delivered_date,
                nextDeliveryDate,
                orderId
            ]);

            // Create delivery record
            const deliveryCode = `DEL${moment().format('YYMMDD')}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
            
            const deliveryQuery = `
                INSERT INTO deliveries (
                    delivery_code, order_id, customer_id, scheduled_date, delivered_date,
                    bottle_type, quantity_scheduled, quantity_delivered, delivery_status,
                    delivery_person, delivery_vehicle, delivery_notes, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *
            `;

            await client.query(deliveryQuery, [
                deliveryCode,
                orderId,
                order.customer_id,
                deliveryData.scheduled_date || deliveryData.delivered_date,
                deliveryData.delivered_date,
                order.bottle_type,
                deliveryData.quantity_delivered,
                deliveryData.quantity_delivered,
                'delivered',
                deliveryData.delivery_person || null,
                deliveryData.delivery_vehicle || null,
                deliveryData.delivery_notes || null,
                userId
            ]);

            // Log delivery in order history
            await client.query(`
                INSERT INTO order_history (order_id, action_type, details, changed_by)
                VALUES ($1, $2, $3, $4)
            `, [orderId, 'delivery_completed', `Delivered ${deliveryData.quantity_delivered} bottles`, userId]);

            // Check if order is completed
            const updatedOrder = orderResult.rows[0];
            if (updatedOrder.bottles_remaining <= 0) {
                await client.query('UPDATE orders SET order_status = $1 WHERE id = $2', ['completed', orderId]);
            }

            await client.query('COMMIT');
            return new Order(updatedOrder);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Get order statistics
    static async getStatistics() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_orders,
                    COUNT(CASE WHEN order_status = 'pending' THEN 1 END) as pending_orders,
                    COUNT(CASE WHEN order_status = 'confirmed' THEN 1 END) as confirmed_orders,
                    COUNT(CASE WHEN order_status = 'in-progress' THEN 1 END) as in_progress_orders,
                    COUNT(CASE WHEN order_status = 'completed' THEN 1 END) as completed_orders,
                    COUNT(CASE WHEN order_type = 'subscription' THEN 1 END) as subscription_orders,
                    COUNT(CASE WHEN order_type = 'on-demand' THEN 1 END) as on_demand_orders,
                    SUM(total_amount) as total_revenue,
                    SUM(bottles_delivered) as total_bottles_delivered,
                    AVG(total_amount) as average_order_value
                FROM orders
            `;

            const result = await pool.query(query);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Get delivery schedule for a date range
    static async getDeliverySchedule(startDate, endDate) {
        try {
            const query = `
                SELECT o.*, c.full_name as customer_name, c.customer_code, 
                       c.phone_primary as customer_phone, c.address_line1, c.city
                FROM orders o
                LEFT JOIN customers c ON o.customer_id = c.id
                WHERE o.next_delivery_date BETWEEN $1 AND $2
                AND o.order_status IN ('pending', 'confirmed', 'in-progress')
                AND o.bottles_remaining > 0
                ORDER BY o.next_delivery_date ASC, o.priority_level DESC
            `;

            const result = await pool.query(query, [startDate, endDate]);
            return result.rows.map(row => new Order(row));
        } catch (error) {
            throw error;
        }
    }
}

module.exports = Order;