// Authentication middleware to protect routes
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        // Make user available as req.user for convenience
        req.user = req.session.user;
        return next();
    } else {
        req.flash('error', 'Please log in to access this page');
        return res.redirect('/auth/login');
    }
};

// Admin role middleware
const isAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Admin access required');
        return res.redirect('/dashboard');
    }
};

// Staff role middleware (admin or staff)
const isStaff = (req, res, next) => {
    if (req.session && req.session.user && 
        (req.session.user.role === 'admin' || req.session.user.role === 'staff')) {
        return next();
    } else {
        req.flash('error', 'Staff access required');
        return res.redirect('/dashboard');
    }
};

// Driver role middleware (for driver-specific routes)
const isDriver = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'driver') {
        return next();
    } else {
        req.flash('error', 'Driver access required');
        return res.redirect('/dashboard');
    }
};

// Can manage users (admin only)
const canManageUsers = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'You do not have permission to manage users');
        return res.redirect('/dashboard');
    }
};

// Can manage vehicles (admin only)
const canManageVehicles = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'You do not have permission to manage vehicles');
        return res.redirect('/dashboard');
    }
};

// Can deliver orders (admin, staff, or driver)
const canDeliverOrders = (req, res, next) => {
    if (req.session && req.session.user && 
        ['admin', 'staff', 'driver'].includes(req.session.user.role)) {
        return next();
    } else {
        req.flash('error', 'You do not have permission to handle deliveries');
        return res.redirect('/dashboard');
    }
};

// Redirect if already authenticated
const redirectIfAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    next();
};

// Rate limiting middleware (simple implementation)
const createRateLimiter = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
    const attempts = new Map();
    
    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        
        if (!attempts.has(key)) {
            attempts.set(key, { count: 1, resetTime: now + windowMs });
            return next();
        }
        
        const userAttempts = attempts.get(key);
        
        if (now > userAttempts.resetTime) {
            attempts.set(key, { count: 1, resetTime: now + windowMs });
            return next();
        }
        
        if (userAttempts.count >= maxAttempts) {
            return res.status(429).json({ 
                error: 'Too many login attempts. Please try again later.' 
            });
        }
        
        userAttempts.count++;
        next();
    };
};

// CSRF protection (simple implementation)
const csrfProtection = (req, res, next) => {
    if (req.method === 'GET') {
        const token = require('crypto').randomBytes(32).toString('hex');
        req.session.csrfToken = token;
        res.locals.csrfToken = token;
    } else {
        const sessionToken = req.session.csrfToken;
        const bodyToken = req.body._csrf;
        
        if (!sessionToken || sessionToken !== bodyToken) {
            return res.status(403).json({ error: 'Invalid CSRF token' });
        }
    }
    next();
};

module.exports = {
    isAuthenticated,
    isAdmin,
    isStaff,
    isDriver,
    canManageUsers,
    canManageVehicles,
    canDeliverOrders,
    redirectIfAuthenticated,
    createRateLimiter,
    csrfProtection
};