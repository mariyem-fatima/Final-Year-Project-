const { pool } = require('./database');

class BottleDelivery {
    constructor(data = {}) {
        this.id = data.id;
        this.order_assignment_id = data.order_assignment_id;
        this.order_id = data.order_id;
        this.bottle_id = data.bottle_id;
        this.customer_id = data.customer_id;
        this.bottle_code = data.bottle_code;
        this.delivery_date = data.delivery_date;
        this.driver_id = data.driver_id;
        this.vehicle_id = data.vehicle_id;
        this.delivery_notes = data.delivery_notes;
        this.created_by = data.created_by;
        this.created_at = data.created_at;
        
        // Joined fields
        this.customer_name = data.customer_name;
        this.customer_phone = data.customer_phone;
        this.customer_address = data.customer_address;
        this.driver_name = data.driver_name;
        this.vehicle_license_plate = data.vehicle_license_plate;
        this.bottle_type = data.bottle_type;
        this.order_number = data.order_number;
    }

    // Get all bottle deliveries for a customer
    static async getCustomerBottles(customerId) {
        try {
            const query = `
                SELECT bd.*, 
                       b.bottle_type, b.manufacturing_date, b.expiry_date,
                       c.full_name as customer_name, c.phone_primary as customer_phone,
                       c.address_line1 as customer_address,
                       d.full_name as driver_name,
                       v.license_plate as vehicle_license_plate,
                       o.order_number
                FROM bottle_deliveries bd
                LEFT JOIN bottles b ON bd.bottle_id = b.id
                LEFT JOIN customers c ON bd.customer_id = c.id
                LEFT JOIN drivers d ON bd.driver_id = d.id
                LEFT JOIN vehicles v ON bd.vehicle_id = v.id
                LEFT JOIN orders o ON bd.order_id = o.id
                WHERE bd.customer_id = $1
                ORDER BY bd.delivery_date DESC
            `;
            
            const result = await pool.query(query, [customerId]);
            return result.rows.map(row => new BottleDelivery(row));
        } catch (error) {
            throw error;
        }
    }

    // Get bottle location history by bottle code
    static async getBottleHistory(bottleCode) {
        try {
            const query = `
                SELECT bd.*, 
                       b.bottle_type, b.status as current_status,
                       c.full_name as customer_name, c.phone_primary as customer_phone,
                       c.address_line1 as customer_address,
                       d.full_name as driver_name,
                       v.license_plate as vehicle_license_plate,
                       o.order_number
                FROM bottle_deliveries bd
                LEFT JOIN bottles b ON bd.bottle_id = b.id
                LEFT JOIN customers c ON bd.customer_id = c.id
                LEFT JOIN drivers d ON bd.driver_id = d.id
                LEFT JOIN vehicles v ON bd.vehicle_id = v.id
                LEFT JOIN orders o ON bd.order_id = o.id
                WHERE bd.bottle_code = $1
                ORDER BY bd.delivery_date DESC
            `;
            
            const result = await pool.query(query, [bottleCode]);
            return result.rows.map(row => new BottleDelivery(row));
        } catch (error) {
            throw error;
        }
    }

    // Get bottles delivered in a date range
    static async getDeliveriesInRange(startDate, endDate, driverId = null) {
        try {
            let query = `
                SELECT bd.*, 
                       b.bottle_type,
                       c.full_name as customer_name, c.phone_primary as customer_phone,
                       c.address_line1 as customer_address,
                       d.full_name as driver_name,
                       v.license_plate as vehicle_license_plate,
                       o.order_number
                FROM bottle_deliveries bd
                LEFT JOIN bottles b ON bd.bottle_id = b.id
                LEFT JOIN customers c ON bd.customer_id = c.id
                LEFT JOIN drivers d ON bd.driver_id = d.id
                LEFT JOIN vehicles v ON bd.vehicle_id = v.id
                LEFT JOIN orders o ON bd.order_id = o.id
                WHERE DATE(bd.delivery_date) BETWEEN $1 AND $2
            `;
            
            const params = [startDate, endDate];
            
            if (driverId) {
                query += ' AND bd.driver_id = $3';
                params.push(driverId);
            }
            
            query += ' ORDER BY bd.delivery_date DESC';
            
            const result = await pool.query(query, params);
            return result.rows.map(row => new BottleDelivery(row));
        } catch (error) {
            throw error;
        }
    }

    // Get bottles currently at customer locations
    static async getBottlesAtCustomers() {
        try {
            const query = `
                SELECT bd.*, 
                       b.bottle_type, b.status as current_status,
                       c.full_name as customer_name, c.phone_primary as customer_phone,
                       c.address_line1 as customer_address, c.city,
                       o.order_number
                FROM bottle_deliveries bd
                LEFT JOIN bottles b ON bd.bottle_id = b.id
                LEFT JOIN customers c ON bd.customer_id = c.id
                LEFT JOIN orders o ON bd.order_id = o.id
                WHERE b.status = 'AtCustomer'
                ORDER BY bd.delivery_date DESC, c.full_name
            `;
            
            const result = await pool.query(query);
            return result.rows.map(row => new BottleDelivery(row));
        } catch (error) {
            throw error;
        }
    }

    // Get delivery statistics
    static async getDeliveryStats(dateRange = 30) {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_deliveries,
                    COUNT(DISTINCT bd.customer_id) as unique_customers,
                    COUNT(DISTINCT bd.driver_id) as active_drivers,
                    COUNT(DISTINCT DATE(bd.delivery_date)) as active_days
                FROM bottle_deliveries bd
                WHERE bd.delivery_date >= CURRENT_DATE - INTERVAL '${dateRange} days'
            `;
            
            const result = await pool.query(query);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Search bottles by customer name or bottle code
    static async searchBottles(searchTerm, limit = 50) {
        try {
            const query = `
                SELECT bd.*, 
                       b.bottle_type, b.status as current_status,
                       c.full_name as customer_name, c.phone_primary as customer_phone,
                       c.address_line1 as customer_address,
                       d.full_name as driver_name,
                       o.order_number
                FROM bottle_deliveries bd
                LEFT JOIN bottles b ON bd.bottle_id = b.id
                LEFT JOIN customers c ON bd.customer_id = c.id
                LEFT JOIN drivers d ON bd.driver_id = d.id
                LEFT JOIN orders o ON bd.order_id = o.id
                WHERE bd.bottle_code ILIKE $1 
                   OR c.full_name ILIKE $1
                   OR c.phone_primary ILIKE $1
                   OR o.order_number ILIKE $1
                ORDER BY bd.delivery_date DESC
                LIMIT $2
            `;
            
            const searchPattern = `%${searchTerm}%`;
            const result = await pool.query(query, [searchPattern, limit]);
            return result.rows.map(row => new BottleDelivery(row));
        } catch (error) {
            throw error;
        }
    }

    // Get delivery summary for reporting
    static async getDeliverySummary(startDate, endDate, groupBy = 'date') {
        try {
            let groupByClause;
            let selectClause;
            
            switch (groupBy) {
                case 'driver':
                    groupByClause = 'd.full_name';
                    selectClause = 'd.full_name as group_name';
                    break;
                case 'customer':
                    groupByClause = 'c.full_name';
                    selectClause = 'c.full_name as group_name';
                    break;
                case 'date':
                default:
                    groupByClause = 'DATE(bd.delivery_date)';
                    selectClause = 'DATE(bd.delivery_date) as group_name';
                    break;
            }
            
            const query = `
                SELECT ${selectClause},
                       COUNT(*) as bottle_count,
                       COUNT(DISTINCT bd.customer_id) as customer_count,
                       COUNT(DISTINCT bd.order_id) as order_count
                FROM bottle_deliveries bd
                LEFT JOIN customers c ON bd.customer_id = c.id
                LEFT JOIN drivers d ON bd.driver_id = d.id
                WHERE DATE(bd.delivery_date) BETWEEN $1 AND $2
                GROUP BY ${groupByClause}
                ORDER BY ${groupByClause}
            `;
            
            const result = await pool.query(query, [startDate, endDate]);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = BottleDelivery;