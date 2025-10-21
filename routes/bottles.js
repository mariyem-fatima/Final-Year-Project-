const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const Bottle = require('../models/Bottle');
const { isAuthenticated, isAdmin, csrfProtection } = require('../middleware/auth');

// Bottles listing page
router.get('/', isAuthenticated, csrfProtection, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const status = req.query.status || null;
        const bottleType = req.query.bottleType || null;
        const search = req.query.search || null;

        const bottles = await Bottle.getAll({ 
            page, 
            limit: 20, 
            status, 
            bottleType, 
            search 
        });

        const statistics = await Bottle.getStatistics();

        res.render('bottles/index', {
            title: 'Bottle Management',
            bottles: bottles,
            statistics: statistics,
            currentUser: req.session.user,
            currentPage: page,
            totalPages: bottles.length > 0 ? Math.ceil(bottles[0].totalCount / 20) : 0,
            filters: { status, bottleType, search }
        });
    } catch (error) {
        console.error('Bottles listing error:', error);
        req.flash('error', 'Error loading bottles');
        res.render('bottles/index', {
            title: 'Bottle Management',
            bottles: [],
            statistics: {},
            currentUser: req.session.user,
            currentPage: 1,
            totalPages: 0,
            filters: { status: null, bottleType: null, search: null }
        });
    }
});

// Add bottle form
router.get('/add', isAuthenticated, csrfProtection, (req, res) => {
    res.render('bottles/add-bottle', {
        title: 'Add New Bottle',
        errors: [],
        formData: {},
        currentUser: req.session.user
    });
});

// Create new bottle
router.post('/add',
    isAuthenticated,
    csrfProtection,
    [
        body('bottleType')
            .isIn(['0.5L', '1L', '5L', '20L'])
            .withMessage('Invalid bottle type selected'),
        body('description')
            .optional({ checkFalsy: true })
            .isLength({ max: 500 })
            .withMessage('Description must be less than 500 characters'),
        body('batchNumber')
            .optional({ checkFalsy: true })
            .isLength({ max: 50 })
            .withMessage('Batch number must be less than 50 characters'),
        body('expiryDate')
            .optional({ checkFalsy: true })
            .isISO8601()
            .toDate()
            .withMessage('Invalid expiry date format')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const { bottleType, description, batchNumber, expiryDate } = req.body;

            if (!errors.isEmpty()) {
                return res.render('bottles/add-bottle', {
                    title: 'Add New Bottle',
                    errors: errors.array(),
                    formData: req.body,
                    currentUser: req.session.user
                });
            }

            const newBottle = await Bottle.create({
                bottleType,
                description,
                batchNumber,
                expiryDate
            }, req.session.user.id);

            req.flash('success', `Bottle ${newBottle.bottleCode} has been created successfully`);
            res.redirect('/bottles');

        } catch (error) {
            console.error('Create bottle error:', error);
            req.flash('error', 'An error occurred while creating the bottle');
            res.render('bottles/add-bottle', {
                title: 'Add New Bottle',
                errors: [],
                formData: req.body,
                currentUser: req.session.user
            });
        }
    }
);

// Bottle detail view
router.get('/:id', isAuthenticated, csrfProtection, async (req, res) => {
    try {
        const bottle = await Bottle.findById(req.params.id);
        if (!bottle) {
            req.flash('error', 'Bottle not found');
            return res.redirect('/bottles');
        }

        const history = await Bottle.getHistory(req.params.id);

        res.render('bottles/detail', {
            title: `Bottle ${bottle.bottleCode} Details`,
            bottle: bottle.toJSON(),
            history: history,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Bottle detail error:', error);
        req.flash('error', 'Error loading bottle details');
        res.redirect('/bottles');
    }
});

// Edit bottle form
router.get('/:id/edit', isAuthenticated, csrfProtection, async (req, res) => {
    try {
        const bottle = await Bottle.findById(req.params.id);
        if (!bottle) {
            req.flash('error', 'Bottle not found');
            return res.redirect('/bottles');
        }

        res.render('bottles/edit-bottle', {
            title: 'Edit Bottle',
            bottle: bottle.toJSON(),
            errors: [],
            formData: {},
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Edit bottle error:', error);
        req.flash('error', 'Error loading bottle');
        res.redirect('/bottles');
    }
});

// Update bottle
router.post('/:id/edit',
    isAuthenticated,
    csrfProtection,
    [
        body('bottleType')
            .isIn(['0.5L', '1L', '5L', '20L'])
            .withMessage('Invalid bottle type selected'),
        body('status')
            .isIn(['AtPlant', 'AtCustomer', 'AtVehicle'])
            .withMessage('Invalid status selected'),
        body('description')
            .optional({ checkFalsy: true })
            .isLength({ max: 500 })
            .withMessage('Description must be less than 500 characters'),
        body('batchNumber')
            .optional({ checkFalsy: true })
            .isLength({ max: 50 })
            .withMessage('Batch number must be less than 50 characters'),
        body('expiryDate')
            .optional({ checkFalsy: true })
            .isISO8601()
            .toDate()
            .withMessage('Invalid expiry date format')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const { bottleType, status, description, batchNumber, expiryDate } = req.body;
            const bottleId = req.params.id;

            if (!errors.isEmpty()) {
                const bottle = await Bottle.findById(bottleId);
                return res.render('bottles/edit-bottle', {
                    title: 'Edit Bottle',
                    bottle: bottle.toJSON(),
                    errors: errors.array(),
                    formData: req.body,
                    currentUser: req.session.user
                });
            }

            const updatedBottle = await Bottle.update(bottleId, {
                bottleType,
                status,
                description,
                batchNumber,
                expiryDate
            }, req.session.user.id);

            if (!updatedBottle) {
                req.flash('error', 'Bottle not found');
                return res.redirect('/bottles');
            }

            req.flash('success', `Bottle ${updatedBottle.bottleCode} has been updated successfully`);
            res.redirect(`/bottles/${bottleId}`);

        } catch (error) {
            console.error('Update bottle error:', error);
            req.flash('error', 'An error occurred while updating the bottle');
            res.redirect('/bottles');
        }
    }
);

// Delete bottle
router.post('/:id/delete', isAuthenticated, csrfProtection, async (req, res) => {
    try {
        const bottleId = req.params.id;
        const bottle = await Bottle.findById(bottleId);
        
        if (!bottle) {
            req.flash('error', 'Bottle not found');
            return res.redirect('/bottles');
        }

        const success = await Bottle.delete(bottleId);
        
        if (success) {
            req.flash('success', `Bottle ${bottle.bottleCode} has been deleted successfully`);
        } else {
            req.flash('error', 'Error deleting bottle');
        }
        
        res.redirect('/bottles');

    } catch (error) {
        console.error('Delete bottle error:', error);
        req.flash('error', 'An error occurred while deleting the bottle');
        res.redirect('/bottles');
    }
});

// Quick status update (AJAX)
router.post('/:id/status', isAuthenticated, async (req, res) => {
    try {
        const { status } = req.body;
        const bottleId = req.params.id;

        if (!['AtPlant', 'AtCustomer', 'AtVehicle'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status' 
            });
        }

        const updatedBottle = await Bottle.update(bottleId, { status }, req.session.user.id);

        if (!updatedBottle) {
            return res.status(404).json({ 
                success: false, 
                message: 'Bottle not found' 
            });
        }

        res.json({
            success: true,
            message: `Status updated to ${status}`,
            bottle: updatedBottle.toJSON()
        });

    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating status'
        });
    }
});

// Bulk operations
router.post('/bulk-action', isAuthenticated, csrfProtection, async (req, res) => {
    try {
        const { action, bottleIds } = req.body;
        
        if (!bottleIds || !Array.isArray(bottleIds) || bottleIds.length === 0) {
            req.flash('error', 'No bottles selected');
            return res.redirect('/bottles');
        }

        let successCount = 0;
        let errorCount = 0;

        for (const bottleId of bottleIds) {
            try {
                if (action === 'delete') {
                    await Bottle.delete(bottleId);
                    successCount++;
                } else if (['AtPlant', 'AtCustomer', 'AtVehicle'].includes(action)) {
                    await Bottle.update(bottleId, { status: action }, req.session.user.id);
                    successCount++;
                }
            } catch (error) {
                console.error(`Bulk action error for bottle ${bottleId}:`, error);
                errorCount++;
            }
        }

        if (successCount > 0) {
            req.flash('success', `${successCount} bottle(s) updated successfully`);
        }
        if (errorCount > 0) {
            req.flash('error', `${errorCount} bottle(s) failed to update`);
        }

        res.redirect('/bottles');

    } catch (error) {
        console.error('Bulk action error:', error);
        req.flash('error', 'Error performing bulk action');
        res.redirect('/bottles');
    }
});

// Search bottles by QR code
router.get('/search/qr/:code', isAuthenticated, async (req, res) => {
    try {
        const bottle = await Bottle.findByCode(req.params.code);
        
        if (!bottle) {
            return res.status(404).json({
                success: false,
                message: 'Bottle not found'
            });
        }

        res.json({
            success: true,
            bottle: bottle.toJSON()
        });

    } catch (error) {
        console.error('QR search error:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching for bottle'
        });
    }
});

// Export bottles data (CSV format)
router.get('/export', isAuthenticated, async (req, res) => {
    try {
        const bottles = await Bottle.getAll({ limit: 10000 }); // Get all bottles
        
        let csvContent = 'Bottle Code,Type,Status,Description,Manufacturing Date,Expiry Date,Batch Number,Created At\n';
        
        bottles.forEach(bottle => {
            const bottleData = bottle.toJSON ? bottle.toJSON() : bottle;
            csvContent += `"${bottleData.bottleCode}","${bottleData.bottleType}","${bottleData.status}","${bottleData.description || ''}","${bottleData.manufacturingDate}","${bottleData.expiryDate}","${bottleData.batchNumber || ''}","${bottleData.createdAt}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="bottles-export-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);

    } catch (error) {
        console.error('Export error:', error);
        req.flash('error', 'Error exporting bottles data');
        res.redirect('/bottles');
    }
});

// Bottle validation API
router.get('/api/validate/:bottleCode', isAuthenticated, async (req, res) => {
    try {
        const { bottleCode } = req.params;
        
        const bottle = await Bottle.findByCode(bottleCode);
        
        if (!bottle) {
            return res.json({
                success: false,
                message: 'Bottle not found'
            });
        }

        res.json({
            success: true,
            bottle: bottle.toJSON(),
            message: 'Bottle found'
        });
    } catch (error) {
        console.error('Error validating bottle:', error);
        res.status(500).json({
            success: false,
            message: 'Error validating bottle'
        });
    }
});

module.exports = router;