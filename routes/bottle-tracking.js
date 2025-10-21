const express = require('express');
const router = express.Router();
const BottleTracking = require('../models/BottleTracking');
const BottleDelivery = require('../models/BottleDelivery');
const Bottle = require('../models/Bottle');
const { pool } = require('../models/database');
const { isAuthenticated } = require('../middleware/auth');

// Apply authentication middleware
router.use(isAuthenticated);

// Main bottle tracking page (QR Scanner)
router.get('/', async (req, res) => {
    try {
        res.render('bottle-tracking/index', {
            title: 'Bottle QR Scanner',
            user: req.user
        });
    } catch (error) {
        console.error('Error loading bottle tracking page:', error);
        req.flash('error', 'Error loading bottle tracking page');
        res.redirect('/dashboard');
    }
});

// QR Code Scanner Page (legacy)
router.get('/scan', (req, res) => {
    res.render('bottles/qr-scanner', {
        title: 'QR Code Scanner',
        currentUser: req.session.user
    });
});

// Process QR Code Scan
router.post('/scan', async (req, res) => {
    try {
        const { qr_data } = req.body;
        
        if (!qr_data) {
            return res.status(400).json({ error: 'QR data is required' });
        }

        const bottle = await BottleTracking.scanBottleQR(qr_data);
        
        if (!bottle) {
            return res.status(404).json({ error: 'Bottle not found' });
        }

        // Get bottle history
        const history = await BottleTracking.getBottleHistory(bottle.id);

        res.json({
            success: true,
            bottle: bottle,
            history: history
        });

    } catch (error) {
        console.error('QR scan error:', error);
        res.status(500).json({ 
            error: 'Failed to process QR code',
            details: error.message 
        });
    }
});

// Update bottle status via QR scan
router.post('/scan/update-status', async (req, res) => {
    try {
        const { bottle_id, new_status, location, notes } = req.body;
        
        // Add status update logic here based on your requirements
        // This would integrate with your BottleTracking methods
        
        res.json({ success: true, message: 'Status updated successfully' });
        
    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Get bottle details
router.get('/:bottle_id/details', async (req, res) => {
    try {
        const { bottle_id } = req.params;
        
        const history = await BottleTracking.getBottleHistory(bottle_id);
        
        res.json({
            success: true,
            history: history
        });
        
    } catch (error) {
        console.error('Error fetching bottle details:', error);
        res.status(500).json({ error: 'Failed to fetch bottle details' });
    }
});

// Get vehicle inventory
router.get('/vehicle/:vehicle_id/inventory', async (req, res) => {
    try {
        const { vehicle_id } = req.params;
        
        const bottles = await BottleTracking.getVehicleBottles(vehicle_id);
        
        res.json({
            success: true,
            bottles: bottles
        });
        
    } catch (error) {
        console.error('Error fetching vehicle inventory:', error);
        res.status(500).json({ error: 'Failed to fetch vehicle inventory' });
    }
});

// Bottle delivery tracking dashboard
router.get('/deliveries', async (req, res) => {
    try {
        const stats = await BottleDelivery.getDeliveryStats(30);
        const bottlesAtCustomers = await BottleDelivery.getBottlesAtCustomers();
        
        res.render('bottle-tracking/deliveries', {
            title: 'Bottle Delivery Tracking',
            stats,
            bottlesAtCustomers,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading bottle delivery dashboard:', error);
        req.flash('error', 'Error loading bottle delivery dashboard');
        res.redirect('/dashboard');
    }
});

// Search delivered bottles
router.get('/deliveries/search', async (req, res) => {
    try {
        const { q } = req.query;
        let results = [];
        
        if (q && q.trim().length > 0) {
            results = await BottleDelivery.searchBottles(q.trim());
        }
        
        res.json({
            success: true,
            results
        });
    } catch (error) {
        console.error('Error searching delivered bottles:', error);
        res.status(500).json({
            success: false,
            error: 'Error searching bottles'
        });
    }
});

// Get customer bottles API
router.get('/customer/:id/bottles', async (req, res) => {
    try {
        const customerId = req.params.id;
        const customerBottles = await BottleDelivery.getCustomerBottles(customerId);
        
        res.json({
            success: true,
            bottles: customerBottles
        });
    } catch (error) {
        console.error('Error loading customer bottles:', error);
        res.status(500).json({
            success: false,
            error: 'Error loading customer bottles'
        });
    }
});

// Bottle history by code API
router.get('/bottle/:code/history', async (req, res) => {
    try {
        const bottleCode = req.params.code;
        const history = await BottleDelivery.getBottleHistory(bottleCode);
        
        res.json({
            success: true,
            history
        });
    } catch (error) {
        console.error('Error loading bottle history:', error);
        res.status(500).json({
            success: false,
            error: 'Error loading bottle history'
        });
    }
});

// Plant operations page
router.get('/plant-operations', async (req, res) => {
    try {
        res.render('bottle-tracking/plant-operations', {
            title: 'Plant Operations',
            user: req.user
        });
    } catch (error) {
        console.error('Error loading plant operations:', error);
        req.flash('error', 'Error loading plant operations');
        res.redirect('/dashboard');
    }
});

// Get plant inventory API
router.get('/api/plant-inventory', async (req, res) => {
    try {
        const { isRefillable } = req.query;
        const filter = {};
        
        if (isRefillable !== undefined) {
            filter.isRefillable = isRefillable === 'true';
        }
        
        const bottles = await Bottle.getPlantInventory(filter);
        
        res.json({
            success: true,
            bottles: bottles.map(bottle => bottle.toJSON())
        });
    } catch (error) {
        console.error('Error getting plant inventory:', error);
        res.status(500).json({
            success: false,
            error: 'Error loading plant inventory'
        });
    }
});

// Load bottles to vehicle API
router.post('/api/load-to-vehicle', async (req, res) => {
    try {
        const { vehicleId, bottleCodes, scanMethod = 'qr' } = req.body;
        
        if (!vehicleId || !bottleCodes || !Array.isArray(bottleCodes) || bottleCodes.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Vehicle ID and bottle codes are required'
            });
        }

        const results = [];
        const errors = [];

        for (const bottleCode of bottleCodes) {
            try {
                const result = await Bottle.transferToVehicle(
                    bottleCode, 
                    vehicleId, 
                    req.user.id, 
                    scanMethod
                );
                results.push({ bottleCode, ...result });
            } catch (error) {
                errors.push({ bottleCode, error: error.message });
            }
        }

        res.json({
            success: errors.length === 0,
            results,
            errors,
            message: errors.length === 0 ? 
                `Successfully loaded ${results.length} bottles to vehicle` :
                `Loaded ${results.length} bottles, ${errors.length} failed`
        });
    } catch (error) {
        console.error('Error loading bottles to vehicle:', error);
        res.status(500).json({
            success: false,
            error: 'Error loading bottles to vehicle'
        });
    }
});

// Return bottle to plant API
router.post('/api/return-to-plant', async (req, res) => {
    try {
        const { bottleCode, scanMethod = 'qr', fromVehicleId } = req.body;
        
        if (!bottleCode) {
            return res.status(400).json({
                success: false,
                message: 'Bottle code is required'
            });
        }

        const result = await Bottle.returnToPlant(
            bottleCode, 
            req.user.id, 
            scanMethod, 
            fromVehicleId
        );

        res.json(result);
    } catch (error) {
        console.error('Error returning bottle to plant:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error returning bottle to plant'
        });
    }
});

// Get recent transfers API
router.get('/api/recent-transfers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                bt.*,
                b.bottle_code,
                b.bottle_type,
                u.email as scanned_by_email,
                v1.license_plate as from_vehicle_plate,
                v2.license_plate as to_vehicle_plate
            FROM bottle_transfers bt
            JOIN bottles b ON bt.bottle_id = b.id
            LEFT JOIN users u ON bt.scanned_by = u.id
            LEFT JOIN vehicles v1 ON bt.from_vehicle_id = v1.id
            LEFT JOIN vehicles v2 ON bt.to_vehicle_id = v2.id
            ORDER BY bt.transferred_at DESC
            LIMIT 20
        `);

        res.json({
            success: true,
            transfers: result.rows
        });
    } catch (error) {
        console.error('Error getting recent transfers:', error);
        res.status(500).json({
            success: false,
            error: 'Error loading recent transfers'
        });
    }
});

// Get vehicle bottle inventory API
router.get('/api/vehicle-inventory/:vehicleId', async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const bottles = await Bottle.getVehicleInventory(vehicleId);
        
        res.json({
            success: true,
            bottles: bottles.map(bottle => bottle.toJSON())
        });
    } catch (error) {
        console.error('Error getting vehicle inventory:', error);
        res.status(500).json({
            success: false,
            error: 'Error loading vehicle inventory'
        });
    }
});

module.exports = router;