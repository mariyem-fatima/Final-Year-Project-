const { pool } = require('./database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Valid user roles
const VALID_ROLES = ['admin', 'staff', 'driver', 'user'];

class User {
    constructor(userData) {
        this.id = userData.id;
        this.email = userData.email;
        this.passwordHash = userData.password_hash;
        this.fingerprintData = userData.fingerprint_data;
        this.pinHash = userData.pin_hash;
        this.isActive = userData.is_active;
        this.role = userData.role;
        this.createdAt = userData.created_at;
        this.updatedAt = userData.updated_at;
        this.lastLogin = userData.last_login;
    }

    // Find user by email
    static async findByEmail(email) {
        try {
            const result = await pool.query(
                'SELECT * FROM users WHERE email = $1 AND is_active = true',
                [email]
            );
            return result.rows.length > 0 ? new User(result.rows[0]) : null;
        } catch (error) {
            console.error('Error finding user by email:', error);
            throw error;
        }
    }

    // Find user by ID
    static async findById(id) {
        try {
            const result = await pool.query(
                'SELECT * FROM users WHERE id = $1 AND is_active = true',
                [id]
            );
            return result.rows.length > 0 ? new User(result.rows[0]) : null;
        } catch (error) {
            console.error('Error finding user by ID:', error);
            throw error;
        }
    }

    // Create new user
    static async create(userData) {
        try {
            const { email, password, pin, fingerprintData, role = 'user' } = userData;
            
            // Validate role
            if (!VALID_ROLES.includes(role)) {
                throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
            }
            
            // Hash password
            const passwordHash = await bcrypt.hash(password, 12);
            
            // Hash PIN if provided
            const pinHash = pin ? await bcrypt.hash(pin, 12) : null;
            
            const result = await pool.query(`
                INSERT INTO users (email, password_hash, pin_hash, fingerprint_data, role)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [email, passwordHash, pinHash, fingerprintData, role]);

            return new User(result.rows[0]);
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    // Verify password
    async verifyPassword(password) {
        try {
            return await bcrypt.compare(password, this.passwordHash);
        } catch (error) {
            console.error('Error verifying password:', error);
            return false;
        }
    }

    // Verify PIN
    async verifyPin(pin) {
        try {
            if (!this.pinHash) return false;
            return await bcrypt.compare(pin, this.pinHash);
        } catch (error) {
            console.error('Error verifying PIN:', error);
            return false;
        }
    }

    // Verify fingerprint (simplified - in real implementation you'd use biometric library)
    async verifyFingerprint(fingerprintData) {
        try {
            if (!this.fingerprintData) return false;
            // Simplified comparison - in production use proper biometric verification
            return this.fingerprintData === fingerprintData;
        } catch (error) {
            console.error('Error verifying fingerprint:', error);
            return false;
        }
    }

    // Update last login
    async updateLastLogin() {
        try {
            await pool.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
                [this.id]
            );
        } catch (error) {
            console.error('Error updating last login:', error);
        }
    }

    // Get all users (for dashboard)
    static async getAll() {
        try {
            const result = await pool.query(`
                SELECT id, email, role, is_active, created_at, last_login 
                FROM users 
                WHERE is_active = true 
                ORDER BY created_at DESC
            `);
            return result.rows;
        } catch (error) {
            console.error('Error getting all users:', error);
            throw error;
        }
    }

    // Get users available for driver linking (only driver role users without existing driver profiles)
    static async getAvailableForDriverLink() {
        try {
            const result = await pool.query(`
                SELECT u.id, u.email, u.role 
                FROM users u
                LEFT JOIN drivers d ON u.id = d.user_id
                WHERE u.is_active = true 
                AND u.role = 'driver'
                AND d.user_id IS NULL
                ORDER BY u.email ASC
            `);
            return result.rows;
        } catch (error) {
            console.error('Error getting available users for driver link:', error);
            throw error;
        }
    }

    // Update user
    static async update(id, userData) {
        try {
            const { email, password, pin, fingerprintData, role, isActive } = userData;
            let updateFields = [];
            let values = [];
            let paramCount = 1;

            if (email) {
                updateFields.push(`email = $${paramCount++}`);
                values.push(email);
            }
            if (password) {
                const passwordHash = await bcrypt.hash(password, 12);
                updateFields.push(`password_hash = $${paramCount++}`);
                values.push(passwordHash);
            }
            if (pin) {
                const pinHash = await bcrypt.hash(pin, 12);
                updateFields.push(`pin_hash = $${paramCount++}`);
                values.push(pinHash);
            }
            if (fingerprintData !== undefined) {
                updateFields.push(`fingerprint_data = $${paramCount++}`);
                values.push(fingerprintData);
            }
            if (role) {
                updateFields.push(`role = $${paramCount++}`);
                values.push(role);
            }
            if (isActive !== undefined) {
                updateFields.push(`is_active = $${paramCount++}`);
                values.push(isActive);
            }

            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(id);

            const query = `
                UPDATE users 
                SET ${updateFields.join(', ')} 
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await pool.query(query, values);
            return result.rows.length > 0 ? new User(result.rows[0]) : null;
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    // Delete user (soft delete)
    static async delete(id) {
        try {
            await pool.query(
                'UPDATE users SET is_active = false WHERE id = $1',
                [id]
            );
            return true;
        } catch (error) {
            console.error('Error deleting user:', error);
            return false;
        }
    }

    // Log login attempt
    static async logLoginAttempt(email, ipAddress, attemptType, success) {
        try {
            await pool.query(`
                INSERT INTO login_attempts (email, ip_address, attempt_type, success)
                VALUES ($1, $2, $3, $4)
            `, [email, ipAddress, attemptType, success]);
        } catch (error) {
            console.error('Error logging login attempt:', error);
        }
    }

    // Get user object without sensitive data
    toJSON() {
        return {
            id: this.id,
            email: this.email,
            role: this.role,
            isActive: this.isActive,
            createdAt: this.createdAt,
            lastLogin: this.lastLogin
        };
    }

    // Static method to get valid roles
    static getValidRoles() {
        return VALID_ROLES;
    }

    // Role checking methods
    isAdmin() {
        return this.role === 'admin';
    }

    isStaff() {
        return this.role === 'staff';
    }

    isDriver() {
        return this.role === 'driver';
    }

    // Permission checking methods
    canManageUsers() {
        return this.role === 'admin';
    }

    canManageVehicles() {
        return this.role === 'admin';
    }

    canAccessAllModules() {
        return this.role === 'admin' || this.role === 'staff';
    }

    canDeliverOrders() {
        return this.role === 'driver' || this.role === 'admin' || this.role === 'staff';
    }
}

module.exports = User;

module.exports = User;