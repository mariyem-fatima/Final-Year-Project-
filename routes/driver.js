const express = require('express');
const router = express.Router();
const { isAuthenticated, isDriver, canDeliverOrders } = require('../middleware/auth');
const Order = require('../models/Order');
const OrderAssignment = require('../models/OrderAssignment');
const Driver = require('../models/Driver');
const Bottle = require('../models/Bottle');

// Driver dashboard - very simple interface
router.get('/dashboard', isAuthenticated, canDeliverOrders, async (req, res) => {
    try {
        // Get today's orders for this driver
        const today = new Date().toISOString().split('T')[0];
        
        // If user is a driver, get their assigned orders
        let orders = [];
        if (req.user.role === 'driver') {
            // First, find the driver record by user_id
            const driver = await Driver.findByUserId(req.user.id);
            
            if (driver) {
                // Find orders assigned to this driver for today
                const assignments = await OrderAssignment.findByDriverAndDate(driver.id, today);
                orders = assignments.map(assignment => ({
                    id: assignment.order_id,
                    assignmentId: assignment.id,
                    customerName: assignment.customer_name,
                    customerAddress: assignment.customer_address,
                    customerPhone: assignment.customer_phone,
                    totalBottles: assignment.total_bottles,
                    deliveryDate: assignment.delivery_date,
                    status: assignment.delivery_status === 'assigned' ? 'pending' : assignment.delivery_status || 'pending',
                    specialInstructions: assignment.special_instructions,
                    timeSlot: assignment.time_slot
                }));
            } else {
                // Driver record not found - this means the user has driver role but no driver profile
                console.warn(`User ${req.user.email} has driver role but no driver profile found`);
                req.flash('warning', 'Driver profile not found. Please contact administrator to set up your driver profile.');
            }
        } else {
            // For admin/staff, show all today's orders
            const allOrders = await Order.findByDate(today);
            orders = allOrders.map(order => ({
                id: order.id,
                customerName: order.customer_name,
                customerAddress: order.customer_address,
                customerPhone: order.customer_phone,
                totalBottles: order.total_bottles,
                deliveryDate: order.delivery_date,
                status: order.status || 'pending',
                specialInstructions: order.special_instructions
            }));
        }

        res.render('driver/dashboard', {
            title: 'Driver Dashboard',
            user: req.user,
            orders: orders,
            todayDate: today
        });
    } catch (error) {
        console.error('Error loading driver dashboard:', error);
        req.flash('error', 'Error loading dashboard');
        res.redirect('/dashboard');
    }
});

// View specific order details
router.get('/order/:id', isAuthenticated, canDeliverOrders, async (req, res) => {
    try {
        const orderId = req.params.id;
        console.log('🔍 Driver trying to view order:', orderId);
        console.log('🔍 User:', req.user.email, 'Role:', req.user.role);
        
        // Get order assignment details
        const assignment = await OrderAssignment.findById(orderId);
        console.log('🔍 Found assignment:', assignment ? 'YES' : 'NO');
        
        if (!assignment) {
            console.log('❌ Order assignment not found for ID:', orderId);
            req.flash('error', 'Order not found');
            return res.redirect('/driver/dashboard');
        }

        console.log('🔍 Assignment details:', {
            id: assignment.id,
            driver_id: assignment.driver_id,
            customer_name: assignment.customer_name
        });

        // Check if driver is authorized to view this order
        if (req.user.role === 'driver') {
            // First, find the driver record by user_id
            const driver = await Driver.findByUserId(req.user.id);
            console.log('🔍 Driver found:', driver ? `ID: ${driver.id}` : 'NO');
            
            if (!driver) {
                console.log('❌ Driver profile not found for user:', req.user.id);
                req.flash('error', 'Driver profile not found');
                return res.redirect('/driver/dashboard');
            }
            
            console.log('🔍 Authorization check: assignment.driver_id =', assignment.driver_id, 'vs driver.id =', driver.id);
            
            if (assignment.driver_id !== driver.id) {
                console.log('❌ Authorization failed');
                req.flash('error', 'You are not authorized to view this order');
                return res.redirect('/driver/dashboard');
            }
        }

        console.log('✅ Rendering order detail page');
        res.render('driver/order-detail', {
            title: 'Order Details',
            user: req.user,
            assignment: assignment
        });
    } catch (error) {
        console.error('❌ Error loading order details:', error);
        req.flash('error', 'Error loading order details');
        res.redirect('/driver/dashboard');
    }
});

// Start delivery process
router.post('/order/:id/start', isAuthenticated, canDeliverOrders, async (req, res) => {
    try {
        const orderId = req.params.id;
        
        // Update assignment status to 'in_progress'
        await OrderAssignment.updateStatus(orderId, 'in_progress');
        
        req.flash('success', 'Delivery started!');
        res.redirect(`/driver/order/${orderId}`);
    } catch (error) {
        console.error('Error starting delivery:', error);
        req.flash('error', 'Error starting delivery');
        res.redirect('/driver/dashboard');
    }
});

// Validate bottle for delivery
router.get('/order/:id/validate-bottle/:bottleCode', isAuthenticated, canDeliverOrders, async (req, res) => {
    try {
        const { id: orderId, bottleCode } = req.params;
        
        // Validate bottle
        const bottle = await Bottle.findByCode(bottleCode);
        
        if (!bottle) {
            return res.json({
                success: false,
                message: 'Bottle not found'
            });
        }

        if (bottle.status !== 'AtVehicle') {
            return res.json({
                success: false,
                message: 'Bottle is not loaded in vehicle'
            });
        }

        res.json({
            success: true,
            bottle: {
                id: bottle.id,
                code: bottle.bottle_code,
                type: bottle.bottle_type,
                status: bottle.status
            }
        });
    } catch (error) {
        console.error('Error validating bottle:', error);
        res.json({
            success: false,
            message: 'Error validating bottle'
        });
    }
});



// Simple route for marking delivery as delivered
router.post('/order/:id/delivered', isAuthenticated, canDeliverOrders, async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const { bottle_codes, notes } = req.body;

        console.log('🚚 Processing delivery for assignment:', assignmentId);
        console.log('🍼 Bottle codes received:', bottle_codes);
        console.log('📝 Notes:', notes);

        // Validate bottle codes if provided
        if (!bottle_codes || !Array.isArray(bottle_codes) || bottle_codes.length === 0) {
            return res.json({ 
                success: false, 
                error: 'At least one bottle code is required' 
            });
        }

        // Validate each bottle code format
        for (const code of bottle_codes) {
            if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
                return res.json({ 
                    success: false, 
                    error: `Invalid bottle code: ${code}. Must be 6 digits.` 
                });
            }
        }

        // Use the proper method that handles bottle status updates
        await OrderAssignment.markDeliveredWithBottles(
            parseInt(assignmentId), 
            bottle_codes, 
            req.user.id, 
            notes || ''
        );

        console.log('✅ Delivery processed successfully with bottle updates');
        res.json({ 
            success: true, 
            message: `Delivery completed with ${bottle_codes.length} bottles` 
        });
    } catch (error) {
        console.error('❌ Error processing delivery:', error);
        res.json({ success: false, error: error.message || 'Failed to process delivery' });
    }
});

// Simple route for marking delivery as failed
router.post('/order/:id/failed', isAuthenticated, canDeliverOrders, async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const { failure_reason } = req.body;

        console.log('❌ Processing failed delivery for assignment:', assignmentId);
        console.log('📝 Failure reason:', failure_reason);

        if (!failure_reason || !failure_reason.trim()) {
            return res.json({ 
                success: false, 
                error: 'Failure reason is required' 
            });
        }

        // Update assignment status to failed
        await OrderAssignment.updateStatus(assignmentId, 'failed', {
            failure_reason: failure_reason.trim(),
            failed_at: new Date()
        });

        console.log('✅ Failed delivery processed successfully');
        res.json({ success: true, message: 'Delivery marked as failed' });
    } catch (error) {
        console.error('❌ Error marking delivery as failed:', error);
        res.json({ success: false, error: 'Failed to update delivery status' });
    }
});

module.exports = router;