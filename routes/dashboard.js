const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const User = require('../models/User');
const { isAuthenticated, isAdmin, canManageUsers, csrfProtection } = require('../middleware/auth');

// Dashboard home page
router.get('/', isAuthenticated, csrfProtection, async (req, res) => {
    try {
        // Redirect drivers to their simple dashboard
        if (req.user.role === 'driver') {
            return res.redirect('/driver/dashboard');
        }

        const users = await User.getAll();
        res.render('dashboard/index', {
            title: 'Dashboard',
            users: users,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        req.flash('error', 'Error loading dashboard');
        res.render('dashboard/index', {
            title: 'Dashboard',
            users: [],
            currentUser: req.session.user
        });
    }
});

// User management page (admin only)
router.get('/users', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
    try {
        const users = await User.getAll();
        res.render('dashboard/users', {
            title: 'User Management',
            users: users,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('User management error:', error);
        req.flash('error', 'Error loading users');
        res.render('dashboard/users', {
            title: 'User Management',
            users: [],
            currentUser: req.session.user
        });
    }
});

// Add user form (admin only)
router.get('/users/add', isAuthenticated, isAdmin, csrfProtection, (req, res) => {
    res.render('dashboard/add-user', {
        title: 'Add New User',
        errors: [],
        formData: {},
        currentUser: req.session.user,
        csrfToken: req.session.csrfToken
    });
});

// Create new user (admin only)
router.post('/users/add',
    isAuthenticated,
    isAdmin,
    csrfProtection,
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Please enter a valid email address'),
        body('password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters long'),
        body('confirmPassword')
            .custom((value, { req }) => {
                if (value !== req.body.password) {
                    throw new Error('Password confirmation does not match password');
                }
                return true;
            }),
        body('pin')
            .optional({ checkFalsy: true })
            .isLength({ min: 4, max: 6 })
            .isNumeric()
            .withMessage('PIN must be 4-6 digits'),
        body('role')
            .isIn(['user', 'staff', 'driver', 'admin'])
            .withMessage('Invalid role selected')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const { email, password, pin, fingerprintData, role } = req.body;

            if (!errors.isEmpty()) {
                return res.render('dashboard/add-user', {
                    title: 'Add New User',
                    errors: errors.array(),
                    formData: req.body,
                    currentUser: req.session.user,
                    csrfToken: req.session.csrfToken
                });
            }

            // Check if user already exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                return res.render('dashboard/add-user', {
                    title: 'Add New User',
                    errors: [{ msg: 'User with this email already exists' }],
                    formData: req.body,
                    currentUser: req.session.user,
                    csrfToken: req.session.csrfToken
                });
            }

            // Create new user
            const newUser = await User.create({
                email,
                password,
                pin: pin || null,
                fingerprintData: fingerprintData || null,
                role
            });

            req.flash('success', `User ${email} has been created successfully`);
            res.redirect('/dashboard/users');

        } catch (error) {
            console.error('Create user error:', error);
            req.flash('error', 'An error occurred while creating the user');
            res.render('dashboard/add-user', {
                title: 'Add New User',
                errors: [],
                formData: req.body,
                currentUser: req.session.user
            });
        }
    }
);

// Edit user form (admin only)
router.get('/users/:id/edit', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/dashboard/users');
        }

        res.render('dashboard/edit-user', {
            title: 'Edit User',
            user: user.toJSON(),
            errors: [],
            formData: {},
            currentUser: req.session.user,
            csrfToken: req.session.csrfToken
        });
    } catch (error) {
        console.error('Edit user error:', error);
        req.flash('error', 'Error loading user');
        res.redirect('/dashboard/users');
    }
});

// Update user (admin only)
router.post('/users/:id/edit',
    isAuthenticated,
    isAdmin,
    csrfProtection,
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Please enter a valid email address'),
        body('password')
            .optional({ checkFalsy: true })
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters long'),
        body('pin')
            .optional({ checkFalsy: true })
            .isLength({ min: 4, max: 6 })
            .isNumeric()
            .withMessage('PIN must be 4-6 digits'),
        body('role')
            .isIn(['user', 'staff', 'driver', 'admin'])
            .withMessage('Invalid role selected')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const { email, password, pin, fingerprintData, role, isActive } = req.body;
            const userId = req.params.id;

            if (!errors.isEmpty()) {
                const user = await User.findById(userId);
                return res.render('dashboard/edit-user', {
                    title: 'Edit User',
                    user: user.toJSON(),
                    errors: errors.array(),
                    formData: req.body,
                    currentUser: req.session.user,
                    csrfToken: req.session.csrfToken
                });
            }

            // Update user
            const updatedUser = await User.update(userId, {
                email,
                password: password || undefined,
                pin: pin || undefined,
                fingerprintData: fingerprintData || undefined,
                role,
                isActive: isActive === 'on'
            });

            if (!updatedUser) {
                req.flash('error', 'User not found');
                return res.redirect('/dashboard/users');
            }

            req.flash('success', `User ${email} has been updated successfully`);
            res.redirect('/dashboard/users');

        } catch (error) {
            console.error('Update user error:', error);
            req.flash('error', 'An error occurred while updating the user');
            res.redirect('/dashboard/users');
        }
    }
);

// Delete user (admin only)
router.post('/users/:id/delete', isAuthenticated, isAdmin, csrfProtection, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Prevent admin from deleting themselves
        if (parseInt(userId) === req.session.user.id) {
            req.flash('error', 'You cannot delete your own account');
            return res.redirect('/dashboard/users');
        }

        const success = await User.delete(userId);
        
        if (success) {
            req.flash('success', 'User has been deleted successfully');
        } else {
            req.flash('error', 'Error deleting user');
        }
        
        res.redirect('/dashboard/users');

    } catch (error) {
        console.error('Delete user error:', error);
        req.flash('error', 'An error occurred while deleting the user');
        res.redirect('/dashboard/users');
    }
});

// Profile page
router.get('/profile', isAuthenticated, csrfProtection, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        res.render('dashboard/profile', {
            title: 'My Profile',
            user: user.toJSON(),
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Profile error:', error);
        req.flash('error', 'Error loading profile');
        res.redirect('/dashboard');
    }
});

module.exports = router;