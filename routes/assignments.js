const express = require('express');
const router = express.Router();
const multer = require('multer');
const OrderAssignment = require('../models/OrderAssignment');
const Driver = require('../models/Driver');
const Vehicle = require('../models/Vehicle');
const Order = require('../models/Order');
const { isAuthenticated } = require('../middleware/auth');
const moment = require('moment');

// Configure multer for form data parsing
const upload = multer();

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// Daily Dispatch Board - Main assignment interface
router.get('/dispatch', async (req, res) => {
    try {
        const selectedDate = req.query.date || moment().format('YYYY-MM-DD');
        
        // Get assignments for the selected date
        const assignments = await OrderAssignment.getAssignmentsForDate(selectedDate);
        
        // Get unassigned orders for the date
        const unassignedOrders = await OrderAssignment.getUnassignedOrders(selectedDate);
        
        // Get available drivers
        const availableDrivers = await Driver.getAvailable();
        
        // Get available vehicles
        const availableVehicles = await Vehicle.getAvailable();
        
        // Get assignment statistics
        const stats = await OrderAssignment.getAssignmentStats(selectedDate);
        
        // Group assignments by driver
        const assignmentsByDriver = {};
        assignments.forEach(assignment => {
            const driverId = assignment.driver_id || 'unassigned';
            if (!assignmentsByDriver[driverId]) {
                assignmentsByDriver[driverId] = [];
            }
            assignmentsByDriver[driverId].push(assignment);
        });

        res.render('assignments/dispatch', {
            title: `Daily Dispatch - ${moment(selectedDate).format('MMMM Do, YYYY')}`,
            selectedDate,
            assignments,
            assignmentsByDriver,
            unassignedOrders,
            availableDrivers,
            availableVehicles,
            stats,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Error loading dispatch board:', error);
        req.flash('error', 'Failed to load dispatch board');
        res.redirect('/dashboard');
    }
});

// Assign order to driver
router.post('/assign', upload.none(), async (req, res) => {
    try {
        const {
            order_id,
            driver_id,
            vehicle_id,
            assigned_date,
            delivery_sequence,
            estimated_delivery_time,
            notes
        } = req.body;

        // Debug logging - what's being received
        console.log('Raw request body:', req.body);
        console.log('order_id value:', order_id, 'type:', typeof order_id);
        console.log('driver_id value:', driver_id, 'type:', typeof driver_id);
        console.log('assigned_date value:', assigned_date, 'type:', typeof assigned_date);

        // Validate required fields
        if (!order_id || isNaN(parseInt(order_id))) {
            console.log('❌ order_id validation failed:', { order_id, parsed: parseInt(order_id), isNaN: isNaN(parseInt(order_id)) });
            return res.status(400).json({ error: 'Valid order_id is required' });
        }
        
        if (!driver_id || isNaN(parseInt(driver_id))) {
            console.log('❌ driver_id validation failed:', { driver_id, parsed: parseInt(driver_id), isNaN: isNaN(parseInt(driver_id)) });
            return res.status(400).json({ error: 'Valid driver_id is required' });
        }
        
        if (!assigned_date) {
            console.log('❌ assigned_date validation failed:', assigned_date);
            return res.status(400).json({ error: 'assigned_date is required' });
        }

        console.log('✅ All validations passed');

        const assignmentData = {
            order_id: parseInt(order_id),
            driver_id: parseInt(driver_id),
            vehicle_id: vehicle_id && !isNaN(parseInt(vehicle_id)) ? parseInt(vehicle_id) : null,
            assigned_date,
            delivery_sequence: delivery_sequence && !isNaN(parseInt(delivery_sequence)) ? parseInt(delivery_sequence) : null,
            estimated_delivery_time: estimated_delivery_time || null,
            notes: notes?.trim()
        };

        // Debug logging
        console.log('Assignment data:', assignmentData);

        const assignment = await OrderAssignment.assignOrder(assignmentData, req.user.id);
        
        req.flash('success', 'Order assigned successfully');
        
        // Return JSON for AJAX requests
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            res.json({
                success: true,
                message: 'Order assigned successfully',
                assignment: assignment
            });
        } else {
            res.redirect(`/assignments/dispatch?date=${assigned_date}`);
        }
    } catch (error) {
        console.error('Error assigning order:', error);
        const errorMessage = error.message || 'Failed to assign order';
        
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            res.status(400).json({
                success: false,
                error: errorMessage
            });
        } else {
            req.flash('error', errorMessage);
            res.redirect(`/assignments/dispatch?date=${req.body.assigned_date}`);
        }
    }
});

// Auto-assign orders
router.post('/auto-assign', async (req, res) => {
    try {
        const { date, maxOrdersPerDriver } = req.body;
        
        const criteria = {
            maxOrdersPerDriver: parseInt(maxOrdersPerDriver) || 10,
            userId: req.user.id
        };

        const assignments = await OrderAssignment.autoAssignOrders(date, criteria);
        
        req.flash('success', `Auto-assigned ${assignments.length} orders to available drivers`);
        res.redirect(`/assignments/dispatch?date=${date}`);
    } catch (error) {
        console.error('Error auto-assigning orders:', error);
        req.flash('error', 'Failed to auto-assign orders: ' + error.message);
        res.redirect(`/assignments/dispatch?date=${req.body.date}`);
    }
});

// Update assignment status
router.post('/:id/status', async (req, res) => {
    try {
        const { status, notes } = req.body;
        
        const updatedAssignment = await OrderAssignment.updateStatus(
            req.params.id, 
            status, 
            req.user.id, 
            notes?.trim()
        );
        
        if (!updatedAssignment) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        res.json({
            success: true,
            message: `Assignment status updated to ${status}`,
            assignment: updatedAssignment
        });
    } catch (error) {
        console.error('Error updating assignment status:', error);
        res.status(500).json({ error: 'Failed to update assignment status' });
    }
});

// Remove assignment
router.delete('/:id', async (req, res) => {
    try {
        const success = await OrderAssignment.removeAssignment(req.params.id, req.user.id);
        
        if (success) {
            res.json({ success: true, message: 'Assignment removed successfully' });
        } else {
            res.status(404).json({ error: 'Assignment not found' });
        }
    } catch (error) {
        console.error('Error removing assignment:', error);
        res.status(500).json({ error: 'Failed to remove assignment' });
    }
});

// Get driver assignments (AJAX endpoint)
router.get('/driver/:driverId/:date', async (req, res) => {
    try {
        const { driverId, date } = req.params;
        const assignments = await OrderAssignment.getDriverAssignments(driverId, date);
        
        res.json({
            success: true,
            assignments: assignments.map(a => ({
                id: a.id,
                order_number: a.order_number,
                customer_name: a.customer_name,
                customer_address: a.customer_address,
                bottle_type: a.bottle_type,
                quantity: a.quantity_per_delivery,
                priority_level: a.priority_level,
                delivery_status: a.delivery_status,
                estimated_time: a.estimated_delivery_time,
                actual_time: a.actual_delivery_time,
                sequence: a.delivery_sequence
            }))
        });
    } catch (error) {
        console.error('Error fetching driver assignments:', error);
        res.status(500).json({ error: 'Failed to fetch driver assignments' });
    }
});

// Bulk status update
router.post('/bulk/status', async (req, res) => {
    try {
        const { assignment_ids, new_status } = req.body;
        
        if (!assignment_ids || !Array.isArray(assignment_ids) || assignment_ids.length === 0) {
            return res.status(400).json({ error: 'No assignments selected' });
        }

        const results = await OrderAssignment.bulkUpdateStatus(
            assignment_ids.map(id => parseInt(id)),
            new_status,
            req.user.id
        );

        res.json({
            success: true,
            message: `Updated ${results.length} assignments to ${new_status}`,
            updated: results
        });
    } catch (error) {
        console.error('Error in bulk status update:', error);
        res.status(500).json({ error: 'Failed to update assignments' });
    }
});

// Assignment statistics (AJAX endpoint)
router.get('/api/stats/:date', async (req, res) => {
    try {
        const stats = await OrderAssignment.getAssignmentStats(req.params.date);
        res.json(stats);
    } catch (error) {
        console.error('Error fetching assignment stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Driver workload report
router.get('/report/workload', async (req, res) => {
    try {
        const date = req.query.date || moment().format('YYYY-MM-DD');
        
        const workloadQuery = `
            SELECT 
                d.id, d.full_name as driver_name, d.phone_primary,
                v.license_plate, v.vehicle_type,
                COUNT(oa.id) as total_assignments,
                COUNT(CASE WHEN oa.delivery_status = 'delivered' THEN 1 END) as completed,
                COUNT(CASE WHEN oa.delivery_status = 'failed' THEN 1 END) as failed,
                COUNT(CASE WHEN oa.delivery_status IN ('assigned', 'in_progress') THEN 1 END) as pending,
                SUM(o.quantity_per_delivery) as total_bottles
            FROM drivers d
            LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
            LEFT JOIN order_assignments oa ON d.id = oa.driver_id AND oa.assigned_date = $1
            LEFT JOIN orders o ON oa.order_id = o.id
            WHERE d.status = 'active'
            GROUP BY d.id, d.full_name, d.phone_primary, v.license_plate, v.vehicle_type
            ORDER BY total_assignments DESC, d.full_name
        `;

        const { pool } = require('../models/database');
        const result = await pool.query(workloadQuery, [date]);

        res.render('assignments/workload-report', {
            title: `Driver Workload Report - ${moment(date).format('MMMM Do, YYYY')}`,
            workload: result.rows,
            selectedDate: date,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Error generating workload report:', error);
        req.flash('error', 'Failed to generate workload report');
        res.redirect('/assignments/dispatch');
    }
});

// Route optimization (basic algorithm)
router.post('/optimize-routes/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const assignments = await OrderAssignment.getAssignmentsForDate(date);
        
        // Group by driver and sort by estimated delivery area/priority
        const optimizedRoutes = {};
        
        assignments.forEach(assignment => {
            if (!assignment.driver_id) return;
            
            if (!optimizedRoutes[assignment.driver_id]) {
                optimizedRoutes[assignment.driver_id] = [];
            }
            optimizedRoutes[assignment.driver_id].push(assignment);
        });

        // Simple optimization: sort by customer city and priority
        Object.keys(optimizedRoutes).forEach(driverId => {
            optimizedRoutes[driverId].sort((a, b) => {
                // First by city (to group nearby deliveries)
                if (a.customer_city !== b.customer_city) {
                    return a.customer_city.localeCompare(b.customer_city);
                }
                // Then by priority
                const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
                return priorityOrder[b.priority_level] - priorityOrder[a.priority_level];
            });

            // Update delivery sequence
            optimizedRoutes[driverId].forEach(async (assignment, index) => {
                try {
                    await OrderAssignment.updateStatus(assignment.id, assignment.delivery_status, req.user.id);
                    // Update sequence number here if needed
                } catch (error) {
                    console.error('Error updating sequence:', error);
                }
            });
        });

        req.flash('success', 'Routes optimized successfully');
        res.redirect(`/assignments/dispatch?date=${date}`);
    } catch (error) {
        console.error('Error optimizing routes:', error);
        req.flash('error', 'Failed to optimize routes');
        res.redirect(`/assignments/dispatch?date=${req.params.date}`);
    }
});

module.exports = router;