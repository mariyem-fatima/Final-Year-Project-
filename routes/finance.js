const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Helper middleware for admin access only
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Admin access required for financial management');
        return res.redirect('/dashboard');
    }
};

// Financial Dashboard - Admin Only
router.get('/dashboard', isAuthenticated, requireAdmin, async (req, res) => {
    try {
        // Get financial overview
        const overviewQuery = `
            SELECT 
                COUNT(CASE WHEN transaction_type = 'income' AND payment_status = 'completed' THEN 1 END) as completed_income,
                COUNT(CASE WHEN transaction_type = 'income' AND payment_status = 'pending' THEN 1 END) as pending_income,
                COUNT(CASE WHEN transaction_type = 'expense' THEN 1 END) as total_expenses,
                SUM(CASE WHEN transaction_type = 'income' AND payment_status = 'completed' THEN amount ELSE 0 END) as total_revenue,
                SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as total_expenses_amount,
                SUM(CASE WHEN transaction_type = 'income' AND payment_status = 'pending' THEN amount ELSE 0 END) as pending_revenue
            FROM transactions
            WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
        `;
        
        const overviewResult = await pool.query(overviewQuery);
        const overview = overviewResult.rows[0];

        // Recent transactions
        const recentQuery = `
            SELECT t.*, c.full_name as customer_name, u.email as created_by_email
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users u ON t.created_by = u.id
            ORDER BY t.created_at DESC
            LIMIT 10
        `;
        const recentResult = await pool.query(recentQuery);
        const recentTransactions = recentResult.rows;

        // Pending payments
        const pendingQuery = `
            SELECT 
                oa.id as assignment_id,
                o.order_number,
                c.full_name as customer_name,
                o.total_amount,
                oa.actual_delivery_time,
                d.full_name as driver_name
            FROM order_assignments oa
            JOIN orders o ON oa.order_id = o.id
            JOIN customers c ON o.customer_id = c.id
            LEFT JOIN drivers d ON oa.driver_id = d.id
            WHERE oa.delivery_status = 'delivered' 
            AND (oa.payment_collected = FALSE OR oa.payment_collected IS NULL)
            ORDER BY oa.actual_delivery_time DESC
            LIMIT 20
        `;
        const pendingResult = await pool.query(pendingQuery);
        const pendingPayments = pendingResult.rows;

        // Monthly package overview
        const packagesQuery = `
            SELECT 
                COUNT(*) as total_packages,
                SUM(monthly_amount) as total_monthly_revenue,
                COUNT(CASE WHEN next_payment_due <= CURRENT_DATE THEN 1 END) as overdue_packages
            FROM monthly_packages 
            WHERE status = 'active'
        `;
        const packagesResult = await pool.query(packagesQuery);
        const packageOverview = packagesResult.rows[0];

        res.render('finance/dashboard', {
            title: 'Financial Management Dashboard',
            overview,
            recentTransactions,
            pendingPayments,
            packageOverview,
            user: req.user
        });

    } catch (error) {
        console.error('Error loading financial dashboard:', error);
        req.flash('error', 'Error loading financial dashboard');
        res.redirect('/dashboard');
    }
});

// Payment Collection Interface
router.get('/payments', isAuthenticated, requireAdmin, async (req, res) => {
    try {
        // Get all pending payments from delivered orders
        const query = `
            SELECT 
                oa.id as assignment_id,
                o.id as order_id,
                o.order_number,
                c.id as customer_id,
                c.full_name as customer_name,
                c.phone_primary,
                o.total_amount,
                o.bottle_type,
                o.quantity_per_delivery,
                oa.actual_delivery_time,
                d.full_name as driver_name,
                oa.notes as delivery_notes
            FROM order_assignments oa
            JOIN orders o ON oa.order_id = o.id
            JOIN customers c ON o.customer_id = c.id
            LEFT JOIN drivers d ON oa.driver_id = d.id
            WHERE oa.delivery_status = 'delivered' 
            AND (oa.payment_collected = FALSE OR oa.payment_collected IS NULL)
            ORDER BY oa.actual_delivery_time DESC
        `;
        
        const result = await pool.query(query);
        const pendingPayments = result.rows;

        res.render('finance/payments', {
            title: 'Payment Collection',
            pendingPayments,
            user: req.user
        });

    } catch (error) {
        console.error('Error loading payments:', error);
        req.flash('error', 'Error loading payment collection page');
        res.redirect('/finance/dashboard');
    }
});

// Mark Payment as Collected
router.post('/payments/:assignmentId/collect', isAuthenticated, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const assignmentId = parseInt(req.params.assignmentId);
        const { payment_method, payment_amount, payment_notes } = req.body;

        // Get assignment and order details
        const assignmentQuery = `
            SELECT oa.*, o.total_amount, o.customer_id, o.order_number
            FROM order_assignments oa
            JOIN orders o ON oa.order_id = o.id
            WHERE oa.id = $1
        `;
        const assignmentResult = await client.query(assignmentQuery, [assignmentId]);
        
        if (assignmentResult.rows.length === 0) {
            throw new Error('Assignment not found');
        }

        const assignment = assignmentResult.rows[0];
        const amount = parseFloat(payment_amount) || parseFloat(assignment.total_amount);

        // Update assignment payment status
        await client.query(`
            UPDATE order_assignments 
            SET payment_collected = TRUE,
                payment_collected_by = $1,
                payment_collected_at = CURRENT_TIMESTAMP,
                collection_notes = $2
            WHERE id = $3
        `, [req.user.id, payment_notes, assignmentId]);

        // Update order payment status
        await client.query(`
            UPDATE orders 
            SET payment_status = 'paid',
                payment_method = $1,
                payment_date = CURRENT_TIMESTAMP,
                payment_amount = $2,
                payment_notes = $3
            WHERE id = $4
        `, [payment_method, amount, payment_notes, assignment.order_id]);

        // Record transaction
        await client.query(`
            INSERT INTO transactions (
                transaction_type, category, amount, description,
                reference_type, reference_id, customer_id,
                payment_method, payment_status, transaction_date,
                created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, $10)
        `, [
            'income',
            'order_payment',
            amount,
            `Payment collected for order ${assignment.order_number}`,
            'assignment',
            assignmentId,
            assignment.customer_id,
            payment_method,
            'completed',
            req.user.id
        ]);

        await client.query('COMMIT');
        
        req.flash('success', `Payment of $${amount} collected successfully for order ${assignment.order_number}`);
        res.redirect('/finance/payments');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error collecting payment:', error);
        req.flash('error', 'Error collecting payment: ' + error.message);
        res.redirect('/finance/payments');
    } finally {
        client.release();
    }
});

// Monthly Packages Management
router.get('/packages', isAuthenticated, requireAdmin, async (req, res) => {
    try {
        // Get monthly packages with customer info
        const packagesQuery = `
            SELECT 
                mp.*,
                c.full_name as customer_name,
                c.phone_primary,
                c.email,
                CASE 
                    WHEN mp.next_payment_due <= CURRENT_DATE THEN 'overdue'
                    WHEN mp.next_payment_due <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
                    ELSE 'current'
                END as payment_status_flag
            FROM monthly_packages mp
            JOIN customers c ON mp.customer_id = c.id
            ORDER BY mp.next_payment_due ASC, c.full_name
        `;
        
        // Get customers for dropdown
        const customersQuery = `
            SELECT id, full_name as name, email, phone_primary as phone 
            FROM customers 
            ORDER BY full_name
        `;
        
        // Get categories for dropdown
        const categoriesQuery = `
            SELECT DISTINCT category_name 
            FROM financial_categories 
            ORDER BY category_name
        `;
        
        // Get staff members
        const staffQuery = `
            SELECT s.*, u.email 
            FROM staff s 
            JOIN users u ON s.user_id = u.id 
            ORDER BY s.full_name
        `;
        
        // Get drivers
        const driversQuery = `
            SELECT d.*, u.email 
            FROM drivers d 
            JOIN users u ON d.user_id = u.id 
            ORDER BY d.full_name
        `;
        
        const [packagesResult, customersResult, categoriesResult, staffResult, driversResult] = await Promise.all([
            pool.query(packagesQuery),
            pool.query(customersQuery),
            pool.query(categoriesQuery),
            pool.query(staffQuery),
            pool.query(driversQuery)
        ]);

        res.render('finance/packages', {
            title: 'Monthly Packages Management',
            packages: packagesResult.rows,
            customers: customersResult.rows,
            categories: categoriesResult.rows,
            staffMembers: staffResult.rows,
            drivers: driversResult.rows,
            user: req.user
        });

    } catch (error) {
        console.error('Error loading packages:', error);
        req.flash('error', 'Error loading monthly packages');
        res.redirect('/finance/dashboard');
    }
});

// Add Monthly Package
router.post('/packages', isAuthenticated, requireAdmin, async (req, res) => {
    try {
        const {
            customer_id,
            package_name,
            monthly_amount,
            bottles_per_month,
            start_date,
            payment_day
        } = req.body;

        // Calculate next payment due date
        const startDate = new Date(start_date);
        const nextPaymentDue = new Date(startDate.getFullYear(), startDate.getMonth() + 1, payment_day);

        const query = `
            INSERT INTO monthly_packages (
                customer_id, package_name, monthly_amount, bottles_per_month,
                start_date, payment_day, next_payment_due, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const result = await pool.query(query, [
            customer_id, package_name, monthly_amount, bottles_per_month,
            start_date, payment_day, nextPaymentDue, req.user.id
        ]);

        req.flash('success', 'Monthly package created successfully');
        res.redirect('/finance/packages');

    } catch (error) {
        console.error('Error creating package:', error);
        req.flash('error', 'Error creating monthly package');
        res.redirect('/finance/packages');
    }
});

// Expense Management
router.get('/expenses', isAuthenticated, requireAdmin, async (req, res) => {
    try {
        // Get recent expenses
        const expensesQuery = `
            SELECT t.*, u.email as created_by_email
            FROM transactions t
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.transaction_type = 'expense'
            ORDER BY t.transaction_date DESC, t.created_at DESC
            LIMIT 50
        `;
        const expensesResult = await pool.query(expensesQuery);
        const expenses = expensesResult.rows;

        // Get expense categories
        const categoriesQuery = `
            SELECT * FROM financial_categories 
            WHERE category_type = 'expense' AND is_active = TRUE
            ORDER BY category_name
        `;
        const categoriesResult = await pool.query(categoriesQuery);
        const categories = categoriesResult.rows;

        // Get staff and drivers for salary expenses
        const staffQuery = `
            SELECT s.*, u.email FROM staff s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.status = 'active'
            ORDER BY s.full_name
        `;
        const staffResult = await pool.query(staffQuery);
        const staffMembers = staffResult.rows;

        const driversQuery = `
            SELECT d.*, u.email FROM drivers d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.status = 'active'
            ORDER BY d.full_name
        `;
        const driversResult = await pool.query(driversQuery);
        const drivers = driversResult.rows;

        res.render('finance/expenses', {
            title: 'Expense Management',
            expenses,
            categories,
            staffMembers,
            drivers,
            user: req.user
        });

    } catch (error) {
        console.error('Error loading expenses:', error);
        req.flash('error', 'Error loading expense management');
        res.redirect('/finance/dashboard');
    }
});

// Add Expense
router.post('/expenses', isAuthenticated, requireAdmin, async (req, res) => {
    try {
        const {
            category,
            amount,
            description,
            employee_id,
            employee_type,
            payment_method,
            transaction_date
        } = req.body;

        let referenceType = null;
        let referenceId = null;

        if (employee_id && employee_type) {
            referenceType = employee_type; // 'staff' or 'driver'
            referenceId = parseInt(employee_id);
        }

        const query = `
            INSERT INTO transactions (
                transaction_type, category, amount, description,
                reference_type, reference_id, employee_id,
                payment_method, payment_status, transaction_date,
                created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', $9, $10)
            RETURNING *
        `;

        await pool.query(query, [
            'expense',
            category,
            parseFloat(amount),
            description,
            referenceType,
            referenceId,
            employee_id || null,
            payment_method,
            transaction_date || new Date().toISOString().split('T')[0],
            req.user.id
        ]);

        req.flash('success', 'Expense recorded successfully');
        res.redirect('/finance/expenses');

    } catch (error) {
        console.error('Error adding expense:', error);
        req.flash('error', 'Error recording expense');
        res.redirect('/finance/expenses');
    }
});

// Financial Reports
router.get('/reports', isAuthenticated, requireAdmin, async (req, res) => {
    try {
        const { start_date, end_date, report_type } = req.query;
        
        // Default to current month if no dates provided
        const startDate = start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        const endDate = end_date || new Date().toISOString().split('T')[0];

        // Get revenue transactions
        const revenueQuery = `
            SELECT t.*, 'Order Payment' as description
            FROM transactions t
            WHERE t.transaction_type = 'income'
            AND t.transaction_date BETWEEN $1 AND $2
            ORDER BY t.transaction_date DESC
        `;
        const revenueResult = await pool.query(revenueQuery, [startDate, endDate]);
        const revenueTransactions = revenueResult.rows;

        // Get expense transactions  
        const expenseQuery = `
            SELECT *
            FROM transactions
            WHERE transaction_type = 'expense'
            AND transaction_date BETWEEN $1 AND $2
            ORDER BY transaction_date DESC
        `;
        const expenseResult = await pool.query(expenseQuery, [startDate, endDate]);
        const expenseTransactions = expenseResult.rows;

        // Calculate totals
        const totalRevenue = revenueTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
        const totalExpenses = expenseTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);

        // Get order count
        const orderCountQuery = `
            SELECT COUNT(*) as count
            FROM orders
            WHERE created_at BETWEEN $1 AND $2
            AND order_status = 'delivered'
        `;
        const orderCountResult = await pool.query(orderCountQuery, [startDate, endDate]);
        const totalOrders = parseInt(orderCountResult.rows[0].count) || 0;

        // Expense categories for pie chart
        const expenseCategories = [...new Set(expenseTransactions.map(t => t.category))];
        const expenseCategoryData = expenseCategories.map(category => 
            expenseTransactions
                .filter(t => t.category === category)
                .reduce((sum, t) => sum + parseFloat(t.amount), 0)
        );

        // Chart data (monthly trends)
        const chartLabels = [];
        const revenueData = [];
        const expenseData = [];
        
        // Generate last 6 months of data
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            chartLabels.push(monthLabel);
            
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
            
            const monthRevenue = revenueTransactions
                .filter(t => t.transaction_date >= monthStart && t.transaction_date <= monthEnd)
                .reduce((sum, t) => sum + parseFloat(t.amount), 0);
            const monthExpense = expenseTransactions
                .filter(t => t.transaction_date >= monthStart && t.transaction_date <= monthEnd)
                .reduce((sum, t) => sum + parseFloat(t.amount), 0);
            
            revenueData.push(monthRevenue);
            expenseData.push(monthExpense);
        }

        const reportData = {
            totalRevenue,
            totalExpenses,
            totalOrders,
            revenueChange: 0, // Could calculate from previous period
            expenseChange: 0, // Could calculate from previous period
            revenueTransactions,
            expenseTransactions,
            expenseCategories,
            expenseCategoryData,
            chartLabels,
            revenueData,
            expenseData
        };

        res.render('finance/reports', {
            title: 'Financial Reports',
            reportData,
            startDate,
            endDate,
            reportType: report_type || 'summary',
            user: req.user
        });

    } catch (error) {
        console.error('Error loading reports:', error);
        req.flash('error', 'Error loading financial reports');
        res.redirect('/finance/dashboard');
    }
});

module.exports = router;