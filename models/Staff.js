const { pool } = require('./database');

class Staff {
    constructor(staffData) {
        this.id = staffData.id;
        this.userId = staffData.user_id;
        this.employeeId = staffData.employee_id;
        this.fullName = staffData.full_name;
        this.position = staffData.position;
        this.department = staffData.department;
        this.phonePrimary = staffData.phone_primary;
        this.phoneSecondary = staffData.phone_secondary;
        this.emergencyContactName = staffData.emergency_contact_name;
        this.emergencyContactPhone = staffData.emergency_contact_phone;
        this.addressLine1 = staffData.address_line1;
        this.addressLine2 = staffData.address_line2;
        this.city = staffData.city;
        this.state = staffData.state;
        this.zipCode = staffData.zip_code;
        this.hireDate = staffData.hire_date;
        this.salaryAmount = staffData.salary_amount;
        this.salaryType = staffData.salary_type;
        this.bankAccountNumber = staffData.bank_account_number;
        this.bankName = staffData.bank_name;
        this.taxId = staffData.tax_id;
        this.status = staffData.status;
        this.notes = staffData.notes;
        this.createdBy = staffData.created_by;
        this.createdAt = staffData.created_at;
        this.updatedAt = staffData.updated_at;
    }

    // Generate unique employee ID
    static generateEmployeeId() {
        const timestamp = Date.now().toString();
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        return 'STF' + timestamp.slice(-4) + random;
    }

    // Create new staff member
    static async create(staffData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Generate employee ID if not provided
            if (!staffData.employee_id) {
                staffData.employee_id = Staff.generateEmployeeId();
            }

            const query = `
                INSERT INTO staff (
                    user_id, employee_id, full_name, position, department,
                    phone_primary, phone_secondary, emergency_contact_name, emergency_contact_phone,
                    address_line1, address_line2, city, state, zip_code,
                    hire_date, salary_amount, salary_type, bank_account_number, bank_name,
                    tax_id, notes, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
                RETURNING *
            `;

            const values = [
                staffData.user_id, staffData.employee_id, staffData.full_name,
                staffData.position, staffData.department, staffData.phone_primary,
                staffData.phone_secondary, staffData.emergency_contact_name, staffData.emergency_contact_phone,
                staffData.address_line1, staffData.address_line2, staffData.city,
                staffData.state, staffData.zip_code, staffData.hire_date,
                staffData.salary_amount, staffData.salary_type || 'monthly',
                staffData.bank_account_number, staffData.bank_name, staffData.tax_id,
                staffData.notes, staffData.created_by
            ];

            const result = await client.query(query, values);
            const staff = new Staff(result.rows[0]);

            // Set up payroll record
            if (staffData.salary_amount) {
                await client.query(`
                    INSERT INTO employee_payroll (employee_id, staff_id, employee_type, salary_type, base_amount)
                    VALUES ($1, $2, 'staff', $3, $4)
                `, [staffData.user_id, staff.id, staffData.salary_type || 'monthly', staffData.salary_amount]);
            }

            // Assign default permissions based on position
            if (staffData.position) {
                const roleTemplate = await client.query(
                    'SELECT default_permissions FROM staff_role_templates WHERE role_name = $1',
                    [staffData.position]
                );

                if (roleTemplate.rows.length > 0 && roleTemplate.rows[0].default_permissions) {
                    for (const permission of roleTemplate.rows[0].default_permissions) {
                        await client.query(`
                            INSERT INTO staff_permissions (staff_id, permission_name, granted_by)
                            VALUES ($1, $2, $3)
                        `, [staff.id, permission, staffData.created_by]);
                    }
                }
            }

            await client.query('COMMIT');
            return staff;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Find staff by user ID
    static async findByUserId(userId) {
        try {
            const query = `
                SELECT s.*, u.email, u.full_name as user_full_name
                FROM staff s
                LEFT JOIN users u ON s.user_id = u.id
                WHERE s.user_id = $1 AND s.status = 'active'
            `;
            const result = await pool.query(query, [userId]);
            
            if (result.rows.length > 0) {
                return new Staff(result.rows[0]);
            }
            return null;
        } catch (error) {
            throw error;
        }
    }

    // Find staff by ID
    static async findById(id) {
        try {
            const query = `
                SELECT s.*, u.email, u.full_name as user_full_name
                FROM staff s
                LEFT JOIN users u ON s.user_id = u.id
                WHERE s.id = $1
            `;
            const result = await pool.query(query, [id]);
            
            if (result.rows.length > 0) {
                return new Staff(result.rows[0]);
            }
            return null;
        } catch (error) {
            throw error;
        }
    }

    // Get all staff members
    static async findAll() {
        try {
            const query = `
                SELECT s.*, u.email, u.full_name as user_full_name
                FROM staff s
                LEFT JOIN users u ON s.user_id = u.id
                ORDER BY s.full_name
            `;
            const result = await pool.query(query);
            return result.rows.map(row => new Staff(row));
        } catch (error) {
            throw error;
        }
    }

    // Get staff with their permissions
    static async findWithPermissions(id) {
        try {
            const staffQuery = `
                SELECT s.*, u.email, u.full_name as user_full_name
                FROM staff s
                LEFT JOIN users u ON s.user_id = u.id
                WHERE s.id = $1
            `;
            const staffResult = await pool.query(staffQuery, [id]);
            
            if (staffResult.rows.length === 0) {
                return null;
            }

            const staff = new Staff(staffResult.rows[0]);

            // Get permissions
            const permissionsQuery = `
                SELECT sp.permission_name, sp.granted_at, u.email as granted_by_email
                FROM staff_permissions sp
                LEFT JOIN users u ON sp.granted_by = u.id
                WHERE sp.staff_id = $1
                ORDER BY sp.permission_name
            `;
            const permissionsResult = await pool.query(permissionsQuery, [id]);
            staff.permissions = permissionsResult.rows;

            return staff;
        } catch (error) {
            throw error;
        }
    }

    // Update staff member
    async update(updateData) {
        try {
            const setClause = [];
            const values = [];
            let paramCount = 1;

            // Build dynamic update query
            for (const [key, value] of Object.entries(updateData)) {
                if (value !== undefined && key !== 'id') {
                    setClause.push(`${key} = $${paramCount}`);
                    values.push(value);
                    paramCount++;
                }
            }

            setClause.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(this.id);

            const query = `
                UPDATE staff 
                SET ${setClause.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await pool.query(query, values);
            
            if (result.rows.length > 0) {
                // Update instance properties
                Object.assign(this, result.rows[0]);
                return this;
            }
            
            throw new Error('Staff member not found');
        } catch (error) {
            throw error;
        }
    }

    // Check if staff has specific permission
    async hasPermission(permissionName) {
        try {
            const query = `
                SELECT COUNT(*) as count
                FROM staff_permissions
                WHERE staff_id = $1 AND permission_name = $2
            `;
            const result = await pool.query(query, [this.id, permissionName]);
            return parseInt(result.rows[0].count) > 0;
        } catch (error) {
            throw error;
        }
    }

    // Grant permission to staff
    async grantPermission(permissionName, grantedBy) {
        try {
            const query = `
                INSERT INTO staff_permissions (staff_id, permission_name, granted_by)
                VALUES ($1, $2, $3)
                ON CONFLICT (staff_id, permission_name) DO NOTHING
                RETURNING *
            `;
            const result = await pool.query(query, [this.id, permissionName, grantedBy]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Revoke permission from staff
    async revokePermission(permissionName) {
        try {
            const query = `
                DELETE FROM staff_permissions
                WHERE staff_id = $1 AND permission_name = $2
            `;
            await pool.query(query, [this.id, permissionName]);
            return true;
        } catch (error) {
            throw error;
        }
    }

    // Deactivate staff member
    async deactivate() {
        try {
            await this.update({ status: 'inactive' });
            return this;
        } catch (error) {
            throw error;
        }
    }

    // Get staff role templates
    static async getRoleTemplates() {
        try {
            const query = 'SELECT * FROM staff_role_templates ORDER BY role_name';
            const result = await pool.query(query);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = Staff;