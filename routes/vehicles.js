const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');
const { isAuthenticated: auth } = require('../middleware/auth');

// Vehicles listing page
router.get('/', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        
        const filters = {
            search: req.query.search || '',
            status: req.query.status || '',
            vehicle_type: req.query.vehicle_type || ''
        };

        const result = await Vehicle.findAll(filters, page, limit);
        
        res.render('vehicles/index', {
            title: 'Vehicle Management',
            vehicles: result.vehicles,
            pagination: result.pagination,
            filters,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading vehicles:', error);
        req.flash('error', 'Error loading vehicles');
        res.redirect('/dashboard');
    }
});

// Add vehicle page
router.get('/add', auth, async (req, res) => {
    try {
        res.render('vehicles/add-vehicle', {
            title: 'Add New Vehicle',
            user: req.user
        });
    } catch (error) {
        console.error('Error loading add vehicle page:', error);
        req.flash('error', 'Error loading page');
        res.redirect('/vehicles');
    }
});

// Create new vehicle
router.post('/add', auth, async (req, res) => {
    try {
        const {
            license_plate,
            vehicle_type,
            brand,
            model,
            year,
            capacity,
            status,
            fuel_type,
            registration_date,
            insurance_expiry,
            last_maintenance,
            notes
        } = req.body;

        // Validation
        if (!license_plate || !vehicle_type || !brand || !model) {
            req.flash('error', 'License plate, vehicle type, brand, and model are required');
            return res.redirect('/vehicles/add');
        }

        // Check if license plate already exists
        const exists = await Vehicle.checkLicensePlateExists(license_plate);
        if (exists) {
            req.flash('error', 'License plate already exists');
            return res.redirect('/vehicles/add');
        }

        const vehicleData = {
            license_plate: license_plate.toUpperCase(),
            vehicle_type,
            brand,
            model,
            year: year ? parseInt(year) : null,
            capacity: capacity ? parseInt(capacity) : 0,
            status: status || 'active',
            fuel_type: fuel_type || 'petrol',
            registration_date: registration_date || null,
            insurance_expiry: insurance_expiry || null,
            last_maintenance: last_maintenance || null,
            notes: notes || null
        };

        await Vehicle.create(vehicleData, req.user.id);
        req.flash('success', 'Vehicle added successfully');
        res.redirect('/vehicles');
    } catch (error) {
        console.error('Error creating vehicle:', error);
        req.flash('error', 'Error creating vehicle: ' + error.message);
        res.redirect('/vehicles/add');
    }
});

// Vehicle detail page
router.get('/:id', auth, async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id);
        
        if (!vehicle) {
            req.flash('error', 'Vehicle not found');
            return res.redirect('/vehicles');
        }

        res.render('vehicles/detail', {
            title: `Vehicle Details - ${vehicle.license_plate}`,
            vehicle,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading vehicle details:', error);
        req.flash('error', 'Error loading vehicle details');
        res.redirect('/vehicles');
    }
});

// Edit vehicle page
router.get('/:id/edit', auth, async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id);
        
        if (!vehicle) {
            req.flash('error', 'Vehicle not found');
            return res.redirect('/vehicles');
        }

        res.render('vehicles/edit-vehicle', {
            title: `Edit Vehicle - ${vehicle.license_plate}`,
            vehicle,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading edit vehicle page:', error);
        req.flash('error', 'Error loading edit page');
        res.redirect('/vehicles');
    }
});

// Update vehicle
router.post('/:id/edit', auth, async (req, res) => {
    try {
        const vehicleId = req.params.id;
        const {
            license_plate,
            vehicle_type,
            brand,
            model,
            year,
            capacity,
            status,
            fuel_type,
            registration_date,
            insurance_expiry,
            last_maintenance,
            notes
        } = req.body;

        // Check if vehicle exists
        const existingVehicle = await Vehicle.findById(vehicleId);
        if (!existingVehicle) {
            req.flash('error', 'Vehicle not found');
            return res.redirect('/vehicles');
        }

        // Check if license plate already exists (excluding current vehicle)
        if (license_plate && license_plate !== existingVehicle.license_plate) {
            const exists = await Vehicle.checkLicensePlateExists(license_plate, vehicleId);
            if (exists) {
                req.flash('error', 'License plate already exists');
                return res.redirect(`/vehicles/${vehicleId}/edit`);
            }
        }

        const updateData = {
            license_plate: license_plate ? license_plate.toUpperCase() : existingVehicle.license_plate,
            vehicle_type: vehicle_type || existingVehicle.vehicle_type,
            brand: brand || existingVehicle.brand,
            model: model || existingVehicle.model,
            year: year ? parseInt(year) : existingVehicle.year,
            capacity: capacity ? parseInt(capacity) : existingVehicle.capacity,
            status: status || existingVehicle.status,
            fuel_type: fuel_type || existingVehicle.fuel_type,
            registration_date: registration_date || existingVehicle.registration_date,
            insurance_expiry: insurance_expiry || existingVehicle.insurance_expiry,
            last_maintenance: last_maintenance || existingVehicle.last_maintenance,
            notes: notes !== undefined ? notes : existingVehicle.notes
        };

        await Vehicle.update(vehicleId, updateData);
        req.flash('success', 'Vehicle updated successfully');
        res.redirect('/vehicles/' + vehicleId);
    } catch (error) {
        console.error('Error updating vehicle:', error);
        req.flash('error', 'Error updating vehicle: ' + error.message);
        res.redirect(`/vehicles/${req.params.id}/edit`);
    }
});

// Delete vehicle
router.post('/:id/delete', auth, async (req, res) => {
    try {
        const vehicleId = req.params.id;
        
        const success = await Vehicle.delete(vehicleId);
        
        if (success) {
            req.flash('success', 'Vehicle deleted successfully');
        } else {
            req.flash('error', 'Vehicle not found');
        }
        
        res.redirect('/vehicles');
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        req.flash('error', 'Error deleting vehicle: ' + error.message);
        res.redirect('/vehicles');
    }
});

// API endpoint for getting available vehicles
router.get('/api/available', auth, async (req, res) => {
    try {
        const vehicles = await Vehicle.getAvailable();
        res.json(vehicles.map(v => ({
            id: v.id,
            license_plate: v.license_plate,
            vehicle_type: v.vehicle_type,
            brand: v.brand,
            model: v.model,
            capacity: v.capacity
        })));
    } catch (error) {
        console.error('Error getting available vehicles:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading available vehicles'
        });
    }
});

// API endpoint for vehicle statistics
router.get('/api/statistics', auth, async (req, res) => {
    try {
        const stats = await Vehicle.getStatistics();
        res.json({
            success: true,
            statistics: stats
        });
    } catch (error) {
        console.error('Error getting vehicle statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading statistics'
        });
    }
});

// API endpoint for maintenance alerts
router.get('/api/maintenance-alerts', auth, async (req, res) => {
    try {
        const alerts = await Vehicle.getMaintenanceAlerts();
        res.json({
            success: true,
            alerts: alerts.map(v => ({
                id: v.id,
                license_plate: v.license_plate,
                vehicle_type: v.vehicle_type,
                brand: v.brand,
                model: v.model,
                alert_type: v.alert_type,
                insurance_expiry: v.insurance_expiry,
                last_maintenance: v.last_maintenance
            }))
        });
    } catch (error) {
        console.error('Error getting maintenance alerts:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading maintenance alerts'
        });
    }
});

// Check license plate availability
router.get('/api/check-license/:plate', auth, async (req, res) => {
    try {
        const licensePlate = req.params.plate;
        const excludeId = req.query.exclude || null;
        
        const exists = await Vehicle.checkLicensePlateExists(licensePlate, excludeId);
        
        res.json({
            success: true,
            exists,
            available: !exists
        });
    } catch (error) {
        console.error('Error checking license plate:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking license plate availability'
        });
    }
});

module.exports = router;