const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();

const { pool, initializeDatabase } = require('./models/database');
const app = express();
const PORT = process.env.PORT || 3000;

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const bottleRoutes = require('./routes/bottles');
const customerRoutes = require('./routes/customers');
const customerBottleRoutes = require('./routes/customer-bottles');
const orderRoutes = require('./routes/orders');
const vehicleRoutes = require('./routes/vehicles');
const driverRoutes = require('./routes/drivers');
const driverAppRoutes = require('./routes/driver');
const financeRoutes = require('./routes/finance');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration with PostgreSQL store
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session'
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(flash());

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global middleware for flash messages and user session
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

// Routes
const assignmentRoutes = require('./routes/assignments');
const bottleTrackingRoutes = require('./routes/bottle-tracking');
const staffRoutes = require('./routes/staff');

app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/bottles', bottleRoutes);
app.use('/bottle-tracking', bottleTrackingRoutes);
app.use('/customers', customerRoutes);
app.use('/customer-bottles', customerBottleRoutes);
app.use('/orders', orderRoutes);
app.use('/assignments', assignmentRoutes);
app.use('/vehicles', vehicleRoutes);
app.use('/drivers', driverRoutes);
app.use('/staff', staffRoutes);
app.use('/driver', driverAppRoutes);
app.use('/finance', financeRoutes);

// Root route - redirect to login
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/auth/login');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        title: 'Error',
        message: 'Something went wrong!' 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', { 
        title: '404 - Page Not Found',
        message: 'The page you are looking for does not exist.' 
    });
});

app.listen(PORT, async () => {
    try {
        await initializeDatabase();
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log('Dashboard Authentication System Started');
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
});