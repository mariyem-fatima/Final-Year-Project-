const express = require('express');
const router = express.Router();
const BottleTracking = require('../models/BottleTracking');
const { isAuthenticated } = require('../middleware/auth');

// Apply authentication middleware
router.use(isAuthenticated);

// QR Code Scanner Page
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

module.exports = router;