const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { isAuthenticated: auth } = require('../middleware/auth');

// Drivers listing page
router.get('/', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        
        const filters = {
            search: req.query.search || '',
            status: req.query.status || '',
            vehicle_assigned: req.query.vehicle_assigned || ''
        };

        const result = await Driver.findAll(filters, page, limit);
        
        res.render('drivers/index', {
            title: 'Driver Management',
            drivers: result.drivers,
            pagination: result.pagination,
            filters,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading drivers:', error);
        req.flash('error', 'Error loading drivers');
        res.redirect('/dashboard');
    }
});

// Add driver page
router.get('/add', auth, async (req, res) => {
    try {
        const availableVehicles = await Vehicle.getAvailable();
        
        // Get available users (drivers without profiles and admins)
        const availableUsers = await User.getAvailableForDriverLink();
        
        res.render('drivers/add-driver', {
            title: 'Add New Driver',
            availableVehicles,
            users: availableUsers,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading add driver page:', error);
        req.flash('error', 'Error loading page');
        res.redirect('/drivers');
    }
});

// Create new driver (handles both /drivers and /drivers/add)
router.post(['/', '/add'], auth, async (req, res) => {
    try {
        const {
            user_id,  // Add user_id field
            full_name,
            cnic,
            phone_primary,
            phone_secondary,
            email,
            license_number,
            license_type,
            license_expiry,
            address,
            city,
            emergency_contact_name,
            emergency_contact_phone,
            assigned_vehicle_id,
            status,
            hire_date,
            salary,
            experience_years,
            notes
        } = req.body;

        // Validation
        if (!full_name || !cnic || !phone_primary || !license_number || !license_type || !license_expiry) {
            req.flash('error', 'Name, CNIC, phone, license number, license type, and license expiry are required');
            return res.redirect('/drivers/add');
        }

        // Validate Pakistani CNIC format
        const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
        if (!cnicRegex.test(cnic)) {
            req.flash('error', 'CNIC must be in format: 12345-1234567-1');
            return res.redirect('/drivers/add');
        }

        // Validate Pakistani phone format
        const phoneRegex = /^(\+92|0)?3\d{9}$/;
        if (!phoneRegex.test(phone_primary.replace(/[-\s]/g, ''))) {
            req.flash('error', 'Please enter a valid Pakistani mobile number');
            return res.redirect('/drivers/add');
        }

        // Check if CNIC already exists
        const cnicExists = await Driver.checkCnicExists(cnic);
        if (cnicExists) {
            req.flash('error', 'CNIC already exists');
            return res.redirect('/drivers/add');
        }

        // Check if license number already exists
        const licenseExists = await Driver.checkLicenseExists(license_number);
        if (licenseExists) {
            req.flash('error', 'License number already exists');
            return res.redirect('/drivers/add');
        }

        const driverData = {
            user_id: user_id || null,  // Include user_id for linking
            full_name,
            cnic,
            phone_primary,
            phone_secondary: phone_secondary || null,
            email: email || null,
            license_number,
            license_type,
            license_expiry,
            address: address || null,
            city: city || null,
            emergency_contact_name: emergency_contact_name || null,
            emergency_contact_phone: emergency_contact_phone || null,
            assigned_vehicle_id: assigned_vehicle_id || null,
            status: status || 'active',
            hire_date: hire_date || new Date().toISOString().split('T')[0],
            salary: salary ? parseFloat(salary) : null,
            experience_years: experience_years ? parseInt(experience_years) : 0,
            notes: notes || null
        };

        await Driver.create(driverData, req.user.id);
        req.flash('success', 'Driver added successfully');
        res.redirect('/drivers');
    } catch (error) {
        console.error('Error creating driver:', error);
        req.flash('error', 'Error creating driver: ' + error.message);
        res.redirect('/drivers/add');
    }
});

// Driver detail page
router.get('/:id', auth, async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);
        
        if (!driver) {
            req.flash('error', 'Driver not found');
            return res.redirect('/drivers');
        }

        res.render('drivers/detail', {
            title: `Driver Details - ${driver.full_name}`,
            driver,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading driver details:', error);
        req.flash('error', 'Error loading driver details');
        res.redirect('/drivers');
    }
});

// Edit driver page
router.get('/:id/edit', auth, async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);
        
        if (!driver) {
            req.flash('error', 'Driver not found');
            return res.redirect('/drivers');
        }

        const availableVehicles = await Vehicle.getAvailable();
        
        // Get available users (only driver role users without existing driver profiles)
        const availableUsers = await User.getAvailableForDriverLink();
        
        // Get current user info if driver is linked to a user
        let currentUser = null;
        if (driver.user_id) {
            currentUser = await User.findById(driver.user_id);
        }
        
        res.render('drivers/edit-driver', {
            title: `Edit Driver - ${driver.full_name}`,
            driver,
            availableVehicles,
            users: availableUsers,
            currentUser,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading edit driver page:', error);
        req.flash('error', 'Error loading edit page');
        res.redirect('/drivers');
    }
});

// Update driver
router.post('/:id/edit', auth, async (req, res) => {
    try {
        const driverId = req.params.id;
        const {
            user_id,  // Add user_id field
            full_name,
            cnic,
            phone_primary,
            phone_secondary,
            email,
            license_number,
            license_type,
            license_expiry,
            address,
            city,
            emergency_contact_name,
            emergency_contact_phone,
            assigned_vehicle_id,
            status,
            hire_date,
            salary,
            experience_years,
            notes
        } = req.body;

        // Check if driver exists
        const existingDriver = await Driver.findById(driverId);
        if (!existingDriver) {
            req.flash('error', 'Driver not found');
            return res.redirect('/drivers');
        }

        // Validate Pakistani CNIC format if changed
        if (cnic && cnic !== existingDriver.cnic) {
            const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
            if (!cnicRegex.test(cnic)) {
                req.flash('error', 'CNIC must be in format: 12345-1234567-1');
                return res.redirect(`/drivers/${driverId}/edit`);
            }

            // Check if CNIC already exists
            const cnicExists = await Driver.checkCnicExists(cnic, driverId);
            if (cnicExists) {
                req.flash('error', 'CNIC already exists');
                return res.redirect(`/drivers/${driverId}/edit`);
            }
        }

        // Validate Pakistani phone format if changed
        if (phone_primary && phone_primary !== existingDriver.phone_primary) {
            const phoneRegex = /^(\+92|0)?3\d{9}$/;
            if (!phoneRegex.test(phone_primary.replace(/[-\s]/g, ''))) {
                req.flash('error', 'Please enter a valid Pakistani mobile number');
                return res.redirect(`/drivers/${driverId}/edit`);
            }
        }

        // Check if license number already exists (excluding current driver)
        if (license_number && license_number !== existingDriver.license_number) {
            const licenseExists = await Driver.checkLicenseExists(license_number, driverId);
            if (licenseExists) {
                req.flash('error', 'License number already exists');
                return res.redirect(`/drivers/${driverId}/edit`);
            }
        }

        const updateData = {
            user_id: user_id !== undefined ? (user_id || null) : existingDriver.user_id,  // Handle user assignment
            full_name: full_name || existingDriver.full_name,
            cnic: cnic || existingDriver.cnic,
            phone_primary: phone_primary || existingDriver.phone_primary,
            phone_secondary: phone_secondary !== undefined ? phone_secondary : existingDriver.phone_secondary,
            email: email !== undefined ? email : existingDriver.email,
            license_number: license_number || existingDriver.license_number,
            license_type: license_type || existingDriver.license_type,
            license_expiry: license_expiry || existingDriver.license_expiry,
            address: address !== undefined ? address : existingDriver.address,
            city: city !== undefined ? city : existingDriver.city,
            emergency_contact_name: emergency_contact_name !== undefined ? emergency_contact_name : existingDriver.emergency_contact_name,
            emergency_contact_phone: emergency_contact_phone !== undefined ? emergency_contact_phone : existingDriver.emergency_contact_phone,
            assigned_vehicle_id: assigned_vehicle_id !== undefined ? assigned_vehicle_id : existingDriver.assigned_vehicle_id,
            status: status || existingDriver.status,
            hire_date: hire_date || existingDriver.hire_date,
            salary: salary ? parseFloat(salary) : existingDriver.salary,
            experience_years: experience_years ? parseInt(experience_years) : existingDriver.experience_years,
            notes: notes !== undefined ? notes : existingDriver.notes
        };

        await Driver.update(driverId, updateData);
        req.flash('success', 'Driver updated successfully');
        res.redirect('/drivers/' + driverId);
    } catch (error) {
        console.error('Error updating driver:', error);
        req.flash('error', 'Error updating driver: ' + error.message);
        res.redirect(`/drivers/${req.params.id}/edit`);
    }
});

// Delete driver
router.post('/:id/delete', auth, async (req, res) => {
    try {
        const driverId = req.params.id;
        
        const success = await Driver.delete(driverId);
        
        if (success) {
            req.flash('success', 'Driver deleted successfully');
        } else {
            req.flash('error', 'Driver not found');
        }
        
        res.redirect('/drivers');
    } catch (error) {
        console.error('Error deleting driver:', error);
        req.flash('error', 'Error deleting driver: ' + error.message);
        res.redirect('/drivers');
    }
});

// Assign vehicle to driver
router.post('/:id/assign-vehicle', auth, async (req, res) => {
    try {
        const driverId = req.params.id;
        const { vehicle_id } = req.body;

        if (!vehicle_id) {
            req.flash('error', 'Please select a vehicle');
            return res.redirect(`/drivers/${driverId}`);
        }

        await Driver.assignVehicle(driverId, vehicle_id);
        req.flash('success', 'Vehicle assigned successfully');
        res.redirect(`/drivers/${driverId}`);
    } catch (error) {
        console.error('Error assigning vehicle:', error);
        req.flash('error', 'Error assigning vehicle: ' + error.message);
        res.redirect(`/drivers/${req.params.id}`);
    }
});

// Remove vehicle assignment
router.post('/:id/remove-vehicle', auth, async (req, res) => {
    try {
        const driverId = req.params.id;

        await Driver.removeVehicleAssignment(driverId);
        req.flash('success', 'Vehicle assignment removed successfully');
        res.redirect(`/drivers/${driverId}`);
    } catch (error) {
        console.error('Error removing vehicle assignment:', error);
        req.flash('error', 'Error removing vehicle assignment: ' + error.message);
        res.redirect(`/drivers/${req.params.id}`);
    }
});

// API endpoint for getting available drivers
router.get('/api/available', auth, async (req, res) => {
    try {
        const drivers = await Driver.getAvailable();
        res.json({
            success: true,
            drivers: drivers.map(d => ({
                id: d.id,
                full_name: d.full_name,
                phone_primary: d.phone_primary,
                license_type: d.license_type,
                vehicle_license_plate: d.vehicle_license_plate,
                vehicle_type: d.vehicle_type
            }))
        });
    } catch (error) {
        console.error('Error getting available drivers:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading available drivers'
        });
    }
});

// API endpoint for driver statistics
router.get('/api/statistics', auth, async (req, res) => {
    try {
        const stats = await Driver.getStatistics();
        res.json({
            success: true,
            statistics: stats
        });
    } catch (error) {
        console.error('Error getting driver statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading statistics'
        });
    }
});

// API endpoint for license expiry alerts
router.get('/api/license-alerts', auth, async (req, res) => {
    try {
        const alerts = await Driver.getLicenseExpiryAlerts();
        res.json({
            success: true,
            alerts: alerts.map(d => ({
                id: d.id,
                full_name: d.full_name,
                license_number: d.license_number,
                license_expiry: d.license_expiry,
                phone_primary: d.phone_primary,
                vehicle_license_plate: d.vehicle_license_plate
            }))
        });
    } catch (error) {
        console.error('Error getting license alerts:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading license alerts'
        });
    }
});

// Check CNIC availability
router.get('/api/check-cnic/:cnic', auth, async (req, res) => {
    try {
        const cnic = req.params.cnic;
        const excludeId = req.query.exclude || null;
        
        const exists = await Driver.checkCnicExists(cnic, excludeId);
        
        res.json({
            success: true,
            exists,
            available: !exists
        });
    } catch (error) {
        console.error('Error checking CNIC:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking CNIC availability'
        });
    }
});

// Check license number availability
router.get('/api/check-license/:license', auth, async (req, res) => {
    try {
        const licenseNumber = req.params.license;
        const excludeId = req.query.exclude || null;
        
        const exists = await Driver.checkLicenseExists(licenseNumber, excludeId);
        
        res.json({
            success: true,
            exists,
            available: !exists
        });
    } catch (error) {
        console.error('Error checking license number:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking license number availability'
        });
    }
});

// Get license alerts (expiring licenses)
router.get('/api/license-alerts', auth, async (req, res) => {
    try {
        const alerts = await Driver.getLicenseAlerts();
        res.json(alerts);
    } catch (error) {
        console.error('Error getting license alerts:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading license alerts'
        });
    }
});

// Get driver activity/recent assignments
router.get('/:id/activity', auth, async (req, res) => {
    try {
        const driverId = req.params.id;
        const activity = await Driver.getRecentActivity(driverId);
        
        res.json(activity);
    } catch (error) {
        console.error('Error loading driver activity:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading driver activity'
        });
    }
});

module.exports = router;