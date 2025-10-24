const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Staff management routes - Admin only
router.use(isAuthenticated);
router.use(isAdmin);

// Get all staff
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT s.*, u.email
            FROM staff s
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.full_name
        `;
        const result = await pool.query(query);
        const staffMembers = result.rows;

        res.render('staff/index', {
            title: 'Staff Management',
            staffMembers,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading staff:', error);
        req.flash('error', 'Error loading staff management');
        res.redirect('/dashboard');
    }
});

// Show add staff form
router.get('/add', async (req, res) => {
    try {
        // Get available users (not already linked to staff or drivers)
        const usersQuery = `
            SELECT u.id, u.email, u.role
            FROM users u
            WHERE u.id NOT IN (
                SELECT user_id FROM staff WHERE user_id IS NOT NULL
                UNION
                SELECT user_id FROM drivers WHERE user_id IS NOT NULL
            )
            ORDER BY u.email
        `;
        const usersResult = await pool.query(usersQuery);
        const availableUsers = usersResult.rows;

        res.render('staff/add-staff', {
            title: 'Add New Staff Member',
            availableUsers,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading add staff form:', error);
        req.flash('error', 'Error loading staff form');
        res.redirect('/staff');
    }
});

// Create new staff
router.post('/', async (req, res) => {
    try {
        const {
            full_name,
            employee_id,
            phone,
            emergency_contact,
            address,
            position,
            department,
            hire_date,
            salary,
            work_schedule,
            status,
            user_id,
            permissions,
            notes
        } = req.body;

        // Check if employee_id already exists
        const existingStaff = await pool.query(
            'SELECT id FROM staff WHERE employee_id = $1',
            [employee_id]
        );

        if (existingStaff.rows.length > 0) {
            req.flash('error', 'Employee ID already exists. Please use a different ID.');
            return res.redirect('/staff/add');
        }

        // Create staff member
        const insertQuery = `
            INSERT INTO staff (
                full_name, employee_id, phone, emergency_contact, address,
                position, department, hire_date, salary, work_schedule,
                status, user_id, permissions, notes, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
            RETURNING id
        `;

        const values = [
            full_name,
            employee_id,
            phone || null,
            emergency_contact || null,
            address || null,
            position,
            department || null,
            hire_date || null,
            salary || null,
            work_schedule || null,
            status || 'active',
            user_id || null,
            permissions || 'basic',
            notes || null
        ];

        const result = await pool.query(insertQuery, values);
        const staffId = result.rows[0].id;

        // If payroll integration is needed, create payroll record
        if (salary) {
            try {
                await pool.query(`
                    INSERT INTO employee_payroll (
                        employee_id, employee_type, base_salary, created_at, updated_at
                    ) VALUES ($1, 'staff', $2, NOW(), NOW())
                `, [staffId, salary]);
            } catch (payrollError) {
                console.log('Payroll record creation failed (table may not exist):', payrollError.message);
            }
        }

        req.flash('success', `Staff member ${full_name} added successfully!`);
        res.redirect(`/staff/${staffId}`);
    } catch (error) {
        console.error('Error creating staff:', error);
        req.flash('error', 'Error creating staff member. Please try again.');
        res.redirect('/staff/add');
    }
});

// Show staff details
router.get('/:id', async (req, res) => {
    try {
        const staffId = req.params.id;
        
        const query = `
            SELECT s.*, u.email
            FROM staff s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.id = $1
        `;
        const result = await pool.query(query, [staffId]);

        if (result.rows.length === 0) {
            req.flash('error', 'Staff member not found');
            return res.redirect('/staff');
        }

        const staff = result.rows[0];

        res.render('staff/detail', {
            title: `${staff.full_name} - Staff Details`,
            staff,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading staff details:', error);
        req.flash('error', 'Error loading staff details');
        res.redirect('/staff');
    }
});

// Show edit staff form
router.get('/:id/edit', async (req, res) => {
    try {
        const staffId = req.params.id;
        
        // Get staff details
        const staffQuery = `
            SELECT s.*, u.email
            FROM staff s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.id = $1
        `;
        const staffResult = await pool.query(staffQuery, [staffId]);

        if (staffResult.rows.length === 0) {
            req.flash('error', 'Staff member not found');
            return res.redirect('/staff');
        }

        const staff = staffResult.rows[0];

        // Get available users (not already linked to other staff/drivers, but include current user)
        const usersQuery = `
            SELECT u.id, u.email, u.role
            FROM users u
            WHERE u.id NOT IN (
                SELECT user_id FROM staff WHERE user_id IS NOT NULL AND id != $1
                UNION
                SELECT user_id FROM drivers WHERE user_id IS NOT NULL
            )
            ORDER BY u.email
        `;
        const usersResult = await pool.query(usersQuery, [staffId]);
        const availableUsers = usersResult.rows;

        res.render('staff/edit-staff', {
            title: `Edit ${staff.full_name}`,
            staff,
            availableUsers,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading edit staff form:', error);
        req.flash('error', 'Error loading edit form');
        res.redirect('/staff');
    }
});

// Update staff
router.put('/:id', async (req, res) => {
    try {
        const staffId = req.params.id;
        const {
            full_name,
            employee_id,
            phone,
            emergency_contact,
            address,
            position,
            department,
            hire_date,
            salary,
            work_schedule,
            status,
            user_id,
            permissions,
            notes
        } = req.body;

        // Check if employee_id already exists for different staff
        const existingStaff = await pool.query(
            'SELECT id FROM staff WHERE employee_id = $1 AND id != $2',
            [employee_id, staffId]
        );

        if (existingStaff.rows.length > 0) {
            req.flash('error', 'Employee ID already exists. Please use a different ID.');
            return res.redirect(`/staff/${staffId}/edit`);
        }

        // Update staff member
        const updateQuery = `
            UPDATE staff SET
                full_name = $1,
                employee_id = $2,
                phone = $3,
                emergency_contact = $4,
                address = $5,
                position = $6,
                department = $7,
                hire_date = $8,
                salary = $9,
                work_schedule = $10,
                status = $11,
                user_id = $12,
                permissions = $13,
                notes = $14,
                updated_at = NOW()
            WHERE id = $15
        `;

        const values = [
            full_name,
            employee_id,
            phone || null,
            emergency_contact || null,
            address || null,
            position,
            department || null,
            hire_date || null,
            salary || null,
            work_schedule || null,
            status || 'active',
            user_id || null,
            permissions || 'basic',
            notes || null,
            staffId
        ];

        await pool.query(updateQuery, values);

        // Update or create payroll record if salary is provided
        if (salary) {
            try {
                const payrollCheck = await pool.query(
                    'SELECT id FROM employee_payroll WHERE employee_id = $1 AND employee_type = $2',
                    [staffId, 'staff']
                );

                if (payrollCheck.rows.length > 0) {
                    // Update existing payroll record
                    await pool.query(
                        'UPDATE employee_payroll SET base_salary = $1, updated_at = NOW() WHERE employee_id = $2 AND employee_type = $3',
                        [salary, staffId, 'staff']
                    );
                } else {
                    // Create new payroll record
                    await pool.query(
                        'INSERT INTO employee_payroll (employee_id, employee_type, base_salary, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
                        [staffId, 'staff', salary]
                    );
                }
            } catch (payrollError) {
                console.log('Payroll update failed (table may not exist):', payrollError.message);
            }
        }

        req.flash('success', `Staff member ${full_name} updated successfully!`);
        res.redirect(`/staff/${staffId}`);
    } catch (error) {
        console.error('Error updating staff:', error);
        req.flash('error', 'Error updating staff member. Please try again.');
        res.redirect(`/staff/${staffId}/edit`);
    }
});

// Delete staff
router.delete('/:id', async (req, res) => {
    try {
        const staffId = req.params.id;

        // Get staff name for confirmation message
        const staffResult = await pool.query('SELECT full_name FROM staff WHERE id = $1', [staffId]);
        if (staffResult.rows.length === 0) {
            req.flash('error', 'Staff member not found');
            return res.redirect('/staff');
        }

        const staffName = staffResult.rows[0].full_name;

        // Delete payroll records first (if they exist)
        try {
            await pool.query('DELETE FROM employee_payroll WHERE employee_id = $1 AND employee_type = $2', [staffId, 'staff']);
        } catch (payrollError) {
            console.log('Payroll deletion failed (table may not exist):', payrollError.message);
        }

        // Delete staff record
        await pool.query('DELETE FROM staff WHERE id = $1', [staffId]);

        req.flash('success', `Staff member ${staffName} deleted successfully!`);
        res.redirect('/staff');
    } catch (error) {
        console.error('Error deleting staff:', error);
        req.flash('error', 'Error deleting staff member. Please try again.');
        res.redirect('/staff');
    }
});

// API endpoint for staff search/filter
router.get('/api/search', async (req, res) => {
    try {
        const { q, status, department } = req.query;
        
        let query = `
            SELECT s.*, u.email
            FROM staff s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (q) {
            query += ` AND (s.full_name ILIKE $${params.length + 1} OR s.employee_id ILIKE $${params.length + 1} OR s.position ILIKE $${params.length + 1})`;
            params.push(`%${q}%`);
        }

        if (status) {
            query += ` AND s.status = $${params.length + 1}`;
            params.push(status);
        }

        if (department) {
            query += ` AND s.department = $${params.length + 1}`;
            params.push(department);
        }

        query += ` ORDER BY s.full_name`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error searching staff:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;