const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');
const { isAuthenticated, isAdmin, isStaff } = require('../middleware/auth');

// Helper middleware for admin/staff access
const requireAdminOrStaff = (req, res, next) => {
    if (req.session && req.session.user && ['admin', 'staff'].includes(req.session.user.role)) {
        return next();
    } else {
        req.flash('error', 'Admin or staff access required');
        return res.redirect('/dashboard');
    }
};

// Customer bottle inventory route
router.get('/bottle-inventory', isAuthenticated, requireAdminOrStaff, async (req, res) => {
    try {
        // Get all customers with their current bottles
        const query = `
            SELECT 
                c.id as customer_id,
                c.full_name as customer_name,
                c.phone_primary,
                c.address_line1,
                c.city,
                COUNT(b.id) as bottles_count,
                ARRAY_AGG(
                    CASE WHEN b.id IS NOT NULL THEN
                        JSON_BUILD_OBJECT(
                            'bottle_code', b.bottle_code,
                            'bottle_type', b.bottle_type,
                            'delivered_at', b.delivered_at,
                            'delivered_by_email', u.email
                        )
                    END
                ) FILTER (WHERE b.id IS NOT NULL) as bottles
            FROM customers c
            LEFT JOIN bottles b ON c.id = b.current_customer_id AND b.status = 'AtCustomer'
            LEFT JOIN users u ON b.delivered_by = u.id
            GROUP BY c.id, c.full_name, c.phone_primary, c.address_line1, c.city
            ORDER BY c.full_name
        `;

        const result = await pool.query(query);
        const customers = result.rows;

        // Get summary statistics
        const statsQuery = `
            SELECT 
                COUNT(DISTINCT b.current_customer_id) as customers_with_bottles,
                COUNT(b.id) as total_bottles_at_customers,
                COUNT(DISTINCT b.bottle_type) as bottle_types_in_circulation
            FROM bottles b
            WHERE b.status = 'AtCustomer' AND b.current_customer_id IS NOT NULL
        `;
        
        const statsResult = await pool.query(statsQuery);
        const stats = statsResult.rows[0];

        res.render('customers/bottle-inventory', {
            customers,
            stats,
            title: 'Customer Bottle Inventory',
            user: req.user
        });

    } catch (error) {
        console.error('Error fetching bottle inventory:', error);
        req.flash('error', 'Error loading bottle inventory');
        res.redirect('/customers');
    }
});

// Individual customer bottle details
router.get('/:id/bottles', isAuthenticated, requireAdminOrStaff, async (req, res) => {
    try {
        const customerId = parseInt(req.params.id);

        // Get customer details
        const customerQuery = 'SELECT * FROM customers WHERE id = $1';
        const customerResult = await pool.query(customerQuery, [customerId]);
        
        if (customerResult.rows.length === 0) {
            req.flash('error', 'Customer not found');
            return res.redirect('/customers');
        }

        const customer = customerResult.rows[0];

        // Get current bottles with customer
        const currentBottlesQuery = `
            SELECT 
                b.bottle_code,
                b.bottle_type,
                b.delivered_at,
                b.status,
                u.email as delivered_by_email,
                u.full_name as delivered_by_name
            FROM bottles b
            LEFT JOIN users u ON b.delivered_by = u.id
            WHERE b.current_customer_id = $1 AND b.status = 'AtCustomer'
            ORDER BY b.delivered_at DESC
        `;

        const currentBottlesResult = await pool.query(currentBottlesQuery, [customerId]);
        const currentBottles = currentBottlesResult.rows;

        // Get bottle delivery history for this customer
        const historyQuery = `
            SELECT 
                bdh.*,
                b.bottle_code,
                b.bottle_type,
                u.email as delivered_by_email,
                o.order_number
            FROM bottle_delivery_history bdh
            JOIN bottles b ON bdh.bottle_id = b.id
            LEFT JOIN users u ON bdh.delivered_by = u.id
            LEFT JOIN orders o ON bdh.order_id = o.id
            WHERE bdh.customer_id = $1
            ORDER BY bdh.delivered_at DESC
            LIMIT 50
        `;

        const historyResult = await pool.query(historyQuery, [customerId]);
        const deliveryHistory = historyResult.rows;

        res.render('customers/bottle-details', {
            customer,
            currentBottles,
            deliveryHistory,
            title: `${customer.full_name} - Bottle Inventory`,
            user: req.user
        });

    } catch (error) {
        console.error('Error fetching customer bottle details:', error);
        req.flash('error', 'Error loading customer bottle details');
        res.redirect('/customers');
    }
});

module.exports = router;