const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const User = require('../models/User');
const { redirectIfAuthenticated, createRateLimiter, csrfProtection } = require('../middleware/auth');

// Rate limiter for login attempts
const loginRateLimit = createRateLimiter(5, 15 * 60 * 1000); // 5 attempts per 15 minutes

// Login page
router.get('/login', redirectIfAuthenticated, csrfProtection, (req, res) => {
    res.render('auth/login', {
        title: 'Login - Dashboard',
        errors: [],
        formData: {}
    });
});

// Email/Password Login
router.post('/login/password', 
    loginRateLimit,
    csrfProtection,
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Please enter a valid email address'),
        body('password')
            .isLength({ min: 1 })
            .withMessage('Password is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const { email, password } = req.body;
            const clientIP = req.ip;

            if (!errors.isEmpty()) {
                return res.render('auth/login', {
                    title: 'Login - Dashboard',
                    errors: errors.array(),
                    formData: req.body
                });
            }

            // Find user by email
            const user = await User.findByEmail(email);
            
            if (!user) {
                await User.logLoginAttempt(email, clientIP, 'password', false);
                req.flash('error', 'Invalid email or password');
                return res.redirect('/auth/login');
            }

            // Verify password
            const isValidPassword = await user.verifyPassword(password);
            
            if (!isValidPassword) {
                await User.logLoginAttempt(email, clientIP, 'password', false);
                req.flash('error', 'Invalid email or password');
                return res.redirect('/auth/login');
            }

            // Successful login
            await User.logLoginAttempt(email, clientIP, 'password', true);
            await user.updateLastLogin();
            
            req.session.user = user.toJSON();
            req.flash('success', 'Login successful');
            
            res.redirect('/dashboard');

        } catch (error) {
            console.error('Password login error:', error);
            req.flash('error', 'An error occurred during login');
            res.redirect('/auth/login');
        }
    }
);

// PIN Login
router.post('/login/pin',
    loginRateLimit,
    csrfProtection,
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Please enter a valid email address'),
        body('pin')
            .isLength({ min: 4, max: 6 })
            .isNumeric()
            .withMessage('PIN must be 4-6 digits')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const { email, pin } = req.body;
            const clientIP = req.ip;

            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            // Find user by email
            const user = await User.findByEmail(email);
            
            if (!user) {
                await User.logLoginAttempt(email, clientIP, 'pin', false);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or PIN'
                });
            }

            // Verify PIN
            const isValidPin = await user.verifyPin(pin);
            
            if (!isValidPin) {
                await User.logLoginAttempt(email, clientIP, 'pin', false);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or PIN'
                });
            }

            // Successful login
            await User.logLoginAttempt(email, clientIP, 'pin', true);
            await user.updateLastLogin();
            
            req.session.user = user.toJSON();
            
            res.json({
                success: true,
                message: 'PIN login successful',
                redirectUrl: '/dashboard'
            });

        } catch (error) {
            console.error('PIN login error:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred during login'
            });
        }
    }
);

// Fingerprint Login
router.post('/login/fingerprint',
    loginRateLimit,
    csrfProtection,
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Please enter a valid email address'),
        body('fingerprintData')
            .isLength({ min: 1 })
            .withMessage('Fingerprint data is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            const { email, fingerprintData } = req.body;
            const clientIP = req.ip;

            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            // Find user by email
            const user = await User.findByEmail(email);
            
            if (!user) {
                await User.logLoginAttempt(email, clientIP, 'fingerprint', false);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or fingerprint'
                });
            }

            // Verify fingerprint
            const isValidFingerprint = await user.verifyFingerprint(fingerprintData);
            
            if (!isValidFingerprint) {
                await User.logLoginAttempt(email, clientIP, 'fingerprint', false);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or fingerprint'
                });
            }

            // Successful login
            await User.logLoginAttempt(email, clientIP, 'fingerprint', true);
            await user.updateLastLogin();
            
            req.session.user = user.toJSON();
            
            res.json({
                success: true,
                message: 'Fingerprint login successful',
                redirectUrl: '/dashboard'
            });

        } catch (error) {
            console.error('Fingerprint login error:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred during login'
            });
        }
    }
);

// Logout (GET for direct links, POST for forms)
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            req.flash('error', 'Error logging out');
            return res.redirect('/dashboard');
        }
        res.clearCookie('connect.sid');
        res.redirect('/auth/login');
    });
});

// Logout           
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            req.flash('error', 'Error logging out');
            return res.redirect('/dashboard');
        }
        res.clearCookie('connect.sid');
        res.redirect('/auth/login');
    });
});

// Check authentication status (for AJAX requests)
router.get('/status', (req, res) => {
    res.json({
        authenticated: !!(req.session && req.session.user),
        user: req.session && req.session.user ? req.session.user : null
    });
});

module.exports = router;