const { pool } = require('./database');

class Driver {
    constructor(data = {}) {
        this.id = data.id;
        this.user_id = data.user_id; // Link to users table
        this.full_name = data.full_name;
        this.cnic = data.cnic;
        this.phone_primary = data.phone_primary;
        this.phone_secondary = data.phone_secondary;
        this.email = data.email;
        this.license_number = data.license_number;
        this.license_type = data.license_type; // motorcycle, car, truck
        this.license_expiry = data.license_expiry;
        this.address = data.address;
        this.city = data.city;
        this.emergency_contact_name = data.emergency_contact_name;
        this.emergency_contact_phone = data.emergency_contact_phone;
        this.assigned_vehicle_id = data.assigned_vehicle_id;
        this.status = data.status || 'active'; // active, inactive, on_leave
        this.hire_date = data.hire_date;
        this.salary = data.salary;
        this.experience_years = data.experience_years;
        this.notes = data.notes;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
        this.created_by = data.created_by;
        
        // Additional fields from joins
        this.vehicle_license_plate = data.vehicle_license_plate;
        this.vehicle_type = data.vehicle_type;
        this.created_by_email = data.created_by_email;
        this.total_orders_today = data.total_orders_today;
    }

    // Create new driver
    static async create(driverData, userId) {
        try {
            const {
                user_id,  // Add user_id for linking to users table
                full_name,
                cnic,
                phone_primary,
                phone_secondary,
                email,
                license_number,
                license_type,
                license_expiry,
                address,
                city,
                emergency_contact_name,
                emergency_contact_phone,
                assigned_vehicle_id,
                status,
                hire_date,
                salary,
                experience_years,
                notes
            } = driverData;

            const query = `
                INSERT INTO drivers (
                    user_id, full_name, cnic, phone_primary, phone_secondary, email,
                    license_number, license_type, license_expiry, address, city,
                    emergency_contact_name, emergency_contact_phone, assigned_vehicle_id,
                    status, hire_date, salary, experience_years, notes, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                RETURNING *
            `;

            const values = [
                user_id, full_name, cnic, phone_primary, phone_secondary, email,
                license_number, license_type, license_expiry, address, city,
                emergency_contact_name, emergency_contact_phone, assigned_vehicle_id,
                status, hire_date, salary, experience_years, notes, userId
            ];

            const result = await pool.query(query, values);
            return new Driver(result.rows[0]);
        } catch (error) {
            throw error;
        }
    }

    // Get driver by ID
    static async findById(id) {
        try {
            const query = `
                SELECT d.*, 
                       v.license_plate as vehicle_license_plate,
                       v.vehicle_type,
                       u.email as created_by_email,
                       COALESCE(orders_today.total_orders, 0) as total_orders_today
                FROM drivers d
                LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
                LEFT JOIN users u ON d.created_by = u.id
                LEFT JOIN (
                    SELECT driver_id, COUNT(*) as total_orders
                    FROM order_assignments oa
                    WHERE DATE(oa.assigned_date) = CURRENT_DATE
                    GROUP BY driver_id
                ) orders_today ON d.id = orders_today.driver_id
                WHERE d.id = $1
            `;
            
            const result = await pool.query(query, [id]);
            return result.rows.length > 0 ? new Driver(result.rows[0]) : null;
        } catch (error) {
            throw error;
        }
    }

    // Get driver by user ID (for authentication integration)
    static async findByUserId(userId) {
        try {
            const query = `
                SELECT d.*, 
                       v.license_plate as vehicle_license_plate,
                       v.vehicle_type,
                       u.email as created_by_email,
                       COALESCE(orders_today.total_orders, 0) as total_orders_today
                FROM drivers d
                LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
                LEFT JOIN users u ON d.created_by = u.id
                LEFT JOIN (
                    SELECT driver_id, COUNT(*) as total_orders
                    FROM order_assignments oa
                    WHERE DATE(oa.assigned_date) = CURRENT_DATE
                    GROUP BY driver_id
                ) orders_today ON d.id = orders_today.driver_id
                WHERE d.user_id = $1
            `;
            
            const result = await pool.query(query, [userId]);
            return result.rows.length > 0 ? new Driver(result.rows[0]) : null;
        } catch (error) {
            throw error;
        }
    }

    // Get all drivers with pagination and filtering
    static async findAll(filters = {}, page = 1, limit = 20) {
        try {
            const offset = (page - 1) * limit;
            let whereClause = 'WHERE 1=1';
            let countWhereClause = 'WHERE 1=1';
            const params = [];
            let paramCount = 1;

            // Search filter
            if (filters.search) {
                whereClause += ` AND (d.full_name ILIKE $${paramCount} OR d.phone_primary ILIKE $${paramCount} OR d.cnic ILIKE $${paramCount} OR d.license_number ILIKE $${paramCount})`;
                countWhereClause += ` AND (full_name ILIKE $${paramCount} OR phone_primary ILIKE $${paramCount} OR cnic ILIKE $${paramCount} OR license_number ILIKE $${paramCount})`;
                params.push(`%${filters.search}%`);
                paramCount++;
            }

            // Status filter
            if (filters.status) {
                whereClause += ` AND d.status = $${paramCount}`;
                countWhereClause += ` AND status = $${paramCount}`;
                params.push(filters.status);
                paramCount++;
            }

            // Vehicle assignment filter
            if (filters.vehicle_assigned === 'yes') {
                whereClause += ` AND d.assigned_vehicle_id IS NOT NULL`;
                countWhereClause += ` AND assigned_vehicle_id IS NOT NULL`;
            } else if (filters.vehicle_assigned === 'no') {
                whereClause += ` AND d.assigned_vehicle_id IS NULL`;
                countWhereClause += ` AND assigned_vehicle_id IS NULL`;
            }

            // Get drivers
            const query = `
                SELECT d.*, 
                       v.license_plate as vehicle_license_plate,
                       v.vehicle_type,
                       u.email as created_by_email,
                       COALESCE(orders_today.total_orders, 0) as total_orders_today
                FROM drivers d
                LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
                LEFT JOIN users u ON d.created_by = u.id
                LEFT JOIN (
                    SELECT driver_id, COUNT(*) as total_orders
                    FROM order_assignments oa
                    WHERE DATE(oa.assigned_date) = CURRENT_DATE
                    GROUP BY driver_id
                ) orders_today ON d.id = orders_today.driver_id
                ${whereClause}
                ORDER BY d.created_at DESC
                LIMIT $${paramCount} OFFSET $${paramCount + 1}
            `;

            const result = await pool.query(query, [...params, limit, offset]);

            // Get total count
            const countQuery = `SELECT COUNT(*) as total FROM drivers ${countWhereClause}`;
            const countResult = await pool.query(countQuery, params.slice(0, paramCount - 1));
            const total = parseInt(countResult.rows[0].total);

            return {
                drivers: result.rows.map(row => new Driver(row)),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            throw error;
        }
    }

    // Update driver
    static async update(id, updateData) {
        try {
            const allowedFields = [
                'user_id', 'full_name', 'cnic', 'phone_primary', 'phone_secondary', 'email',
                'license_number', 'license_type', 'license_expiry', 'address', 'city',
                'emergency_contact_name', 'emergency_contact_phone', 'assigned_vehicle_id',
                'status', 'hire_date', 'salary', 'experience_years', 'notes'
            ];

            const updateFields = [];
            const values = [];
            let paramCount = 1;

            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key) && value !== undefined) {
                    updateFields.push(`${key} = $${paramCount}`);
                    values.push(value);
                    paramCount++;
                }
            }

            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }

            updateFields.push(`updated_at = NOW()`);
            values.push(id);

            const query = `
                UPDATE drivers 
                SET ${updateFields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await pool.query(query, values);
            return result.rows.length > 0 ? new Driver(result.rows[0]) : null;
        } catch (error) {
            throw error;
        }
    }

    // Delete driver (soft delete by setting status to inactive)
    static async delete(id) {
        try {
            // Check if driver has orders assigned today
            const ordersCheck = await pool.query(
                'SELECT COUNT(*) as count FROM order_assignments WHERE driver_id = $1 AND DATE(assigned_date) = CURRENT_DATE',
                [id]
            );

            if (parseInt(ordersCheck.rows[0].count) > 0) {
                throw new Error('Cannot delete driver with orders assigned for today');
            }

            // Soft delete
            const query = `
                UPDATE drivers 
                SET status = 'inactive',
                    assigned_vehicle_id = NULL,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;

            const result = await pool.query(query, [id]);
            return result.rows.length > 0;
        } catch (error) {
            throw error;
        }
    }

    // Assign vehicle to driver
    static async assignVehicle(driverId, vehicleId) {
        try {
            // Check if vehicle is already assigned to another active driver
            const existingAssignment = await pool.query(
                'SELECT id, full_name FROM drivers WHERE assigned_vehicle_id = $1 AND status = $2 AND id != $3',
                [vehicleId, 'active', driverId]
            );

            if (existingAssignment.rows.length > 0) {
                throw new Error(`Vehicle is already assigned to ${existingAssignment.rows[0].full_name}`);
            }

            const query = `
                UPDATE drivers 
                SET assigned_vehicle_id = $1,
                    updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;

            const result = await pool.query(query, [vehicleId, driverId]);
            return result.rows.length > 0 ? new Driver(result.rows[0]) : null;
        } catch (error) {
            throw error;
        }
    }

    // Remove vehicle assignment
    static async removeVehicleAssignment(driverId) {
        try {
            const query = `
                UPDATE drivers 
                SET assigned_vehicle_id = NULL,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;

            const result = await pool.query(query, [driverId]);
            return result.rows.length > 0 ? new Driver(result.rows[0]) : null;
        } catch (error) {
            throw error;
        }
    }

    // Get available drivers (active and not on leave)
    static async getAvailable() {
        try {
            const query = `
                SELECT d.*, v.license_plate as vehicle_license_plate, v.vehicle_type
                FROM drivers d
                LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
                WHERE d.status = 'active'
                ORDER BY d.full_name
            `;

            const result = await pool.query(query);
            return result.rows.map(row => new Driver(row));
        } catch (error) {
            throw error;
        }
    }

    // Get driver statistics
    static async getStatistics() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_drivers,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_drivers,
                    COUNT(CASE WHEN status = 'on_leave' THEN 1 END) as on_leave_drivers,
                    COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_drivers,
                    COUNT(CASE WHEN assigned_vehicle_id IS NOT NULL THEN 1 END) as drivers_with_vehicles,
                    AVG(EXTRACT(YEAR FROM AGE(CURRENT_DATE, hire_date))) as avg_tenure_years
                FROM drivers
            `;

            const result = await pool.query(query);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Check if CNIC exists
    static async checkCnicExists(cnic, excludeId = null) {
        try {
            let query = 'SELECT id FROM drivers WHERE cnic = $1';
            const params = [cnic];

            if (excludeId) {
                query += ' AND id != $2';
                params.push(excludeId);
            }

            const result = await pool.query(query, params);
            return result.rows.length > 0;
        } catch (error) {
            throw error;
        }
    }

    // Check if license number exists
    static async checkLicenseExists(licenseNumber, excludeId = null) {
        try {
            let query = 'SELECT id FROM drivers WHERE license_number = $1';
            const params = [licenseNumber];

            if (excludeId) {
                query += ' AND id != $2';
                params.push(excludeId);
            }

            const result = await pool.query(query, params);
            return result.rows.length > 0;
        } catch (error) {
            throw error;
        }
    }

    // Get drivers with expiring licenses
    static async getLicenseExpiryAlerts() {
        try {
            const query = `
                SELECT d.*, v.license_plate as vehicle_license_plate
                FROM drivers d
                LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
                WHERE d.status = 'active' 
                AND d.license_expiry <= CURRENT_DATE + INTERVAL '30 days'
                ORDER BY d.license_expiry
            `;

            const result = await pool.query(query);
            return result.rows.map(row => new Driver(row));
        } catch (error) {
            throw error;
        }
    }

    // Convert to JSON
    toJSON() {
        return {
            id: this.id,
            full_name: this.full_name,
            cnic: this.cnic,
            phone_primary: this.phone_primary,
            phone_secondary: this.phone_secondary,
            email: this.email,
            license_number: this.license_number,
            license_type: this.license_type,
            license_expiry: this.license_expiry,
            address: this.address,
            city: this.city,
            emergency_contact_name: this.emergency_contact_name,
            emergency_contact_phone: this.emergency_contact_phone,
            assigned_vehicle_id: this.assigned_vehicle_id,
            status: this.status,
            hire_date: this.hire_date,
            salary: this.salary,
            experience_years: this.experience_years,
            notes: this.notes,
            created_at: this.created_at,
            updated_at: this.updated_at,
            created_by: this.created_by
        };
    }
    
    // Get license alerts (expiring or expired licenses)
    static async getLicenseAlerts(daysThreshold = 30) {
        try {
            const query = `
                SELECT 
                    id,
                    full_name as name,
                    license_number,
                    license_type,
                    license_expiry,
                    EXTRACT(DAYS FROM (license_expiry - CURRENT_DATE)) as days_until_expiry
                FROM drivers
                WHERE status = 'active'
                AND (license_expiry <= CURRENT_DATE + INTERVAL '${daysThreshold} days' OR license_expiry < CURRENT_DATE)
                ORDER BY license_expiry ASC
            `;
            
            const result = await pool.query(query);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }
    
    // Get recent activity for a driver
    static async getRecentActivity(driverId, limit = 10) {
        try {
            const query = `
                SELECT 
                    oa.assigned_date as date,
                    COUNT(oa.order_id) as order_count,
                    oa.delivery_status as status,
                    v.license_plate || ' - ' || v.vehicle_type as vehicle_info
                FROM order_assignments oa
                LEFT JOIN vehicles v ON oa.vehicle_id = v.id
                WHERE oa.driver_id = $1
                GROUP BY oa.assigned_date, oa.delivery_status, v.license_plate, v.vehicle_type
                ORDER BY oa.assigned_date DESC
                LIMIT $2
            `;
            
            const result = await pool.query(query, [driverId, limit]);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = Driver;