const { pool } = require('./database');
const QRCode = require('qrcode');
const moment = require('moment');

class Bottle {
    constructor(bottleData) {
        this.id = bottleData.id;
        this.bottleCode = bottleData.bottle_code;
        this.bottleType = bottleData.bottle_type;
        this.qrCodeData = bottleData.qr_code_data;
        this.status = bottleData.status;
        this.isRefillable = bottleData.is_refillable;
        this.currentVehicleId = bottleData.current_vehicle_id;
        this.description = bottleData.description;
        this.manufacturingDate = bottleData.manufacturing_date;
        this.expiryDate = bottleData.expiry_date;
        this.batchNumber = bottleData.batch_number;
        this.createdBy = bottleData.created_by;
        this.createdAt = bottleData.created_at;
        this.updatedAt = bottleData.updated_at;
        this.lastStatusChange = bottleData.last_status_change;
    }

    // Generate unique 6-digit bottle code
    static generateBottleCode() {
        const timestamp = Date.now().toString();
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return (timestamp.slice(-3) + random).slice(0, 6);
    }

    // Generate QR code data URL
    static async generateQRCode(bottleCode, bottleType) {
        try {
            const qrData = {
                code: bottleCode,
                type: bottleType,
                timestamp: Date.now(),
                company: 'Water Management System'
            };

            const qrString = JSON.stringify(qrData);
            const qrCodeDataURL = await QRCode.toDataURL(qrString, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                quality: 0.92,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                width: 200
            });

            return qrCodeDataURL;
        } catch (error) {
            console.error('Error generating QR code:', error);
            throw error;
        }
    }

    // Create new bottle
    static async create(bottleData, createdByUserId) {
        try {
            const { bottleType, description, batchNumber, expiryDate } = bottleData;

            // Determine if bottle is refillable (5L and 20L are refillable)
            const isRefillable = bottleType === '5L' || bottleType === '20L';

            // Generate unique bottle code
            let bottleCode;
            let isUnique = false;
            while (!isUnique) {
                bottleCode = this.generateBottleCode();
                const existingBottle = await pool.query(
                    'SELECT id FROM bottles WHERE bottle_code = $1',
                    [bottleCode]
                );
                isUnique = existingBottle.rows.length === 0;
            }

            // Generate QR code
            const qrCodeData = await this.generateQRCode(bottleCode, bottleType);

            // Calculate expiry date if not provided (default 2 years from manufacturing)
            const calculatedExpiryDate = expiryDate || moment().add(2, 'years').format('YYYY-MM-DD');

            const result = await pool.query(`
                INSERT INTO bottles (
                    bottle_code, bottle_type, qr_code_data, description, 
                    expiry_date, batch_number, created_by, is_refillable, qr_code
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $1)
                RETURNING *
            `, [
                bottleCode, bottleType, qrCodeData, description,
                calculatedExpiryDate, batchNumber, createdByUserId, isRefillable
            ]);

            const newBottle = new Bottle(result.rows[0]);

            // Log initial status
            await this.logStatusChange(newBottle.id, null, 'AtPlant', createdByUserId, 'Initial bottle creation');

            return newBottle;
        } catch (error) {
            console.error('Error creating bottle:', error);
            throw error;
        }
    }

    // Find bottle by ID
    static async findById(id) {
        try {
            const result = await pool.query(
                'SELECT * FROM bottles WHERE id = $1',
                [id]
            );
            return result.rows.length > 0 ? new Bottle(result.rows[0]) : null;
        } catch (error) {
            console.error('Error finding bottle by ID:', error);
            throw error;
        }
    }

    // Find bottle by code
    static async findByCode(bottleCode) {
        try {
            const result = await pool.query(
                'SELECT * FROM bottles WHERE bottle_code = $1',
                [bottleCode]
            );
            return result.rows.length > 0 ? new Bottle(result.rows[0]) : null;
        } catch (error) {
            console.error('Error finding bottle by code:', error);
            throw error;
        }
    }

    // Get all bottles with pagination and filters
    static async getAll(options = {}) {
        try {
            const {
                page = 1,
                limit = 20,
                status = null,
                bottleType = null,
                search = null
            } = options;

            const offset = (page - 1) * limit;
            let whereConditions = [];
            let queryParams = [];
            let paramCount = 1;

            if (status) {
                whereConditions.push(`b.status = $${paramCount++}`);
                queryParams.push(status);
            }

            if (bottleType) {
                whereConditions.push(`b.bottle_type = $${paramCount++}`);
                queryParams.push(bottleType);
            }

            if (search) {
                whereConditions.push(`(b.bottle_code ILIKE $${paramCount} OR b.description ILIKE $${paramCount} OR b.batch_number ILIKE $${paramCount})`);
                queryParams.push(`%${search}%`);
                paramCount++;
            }

            const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

            const query = `
                SELECT 
                    b.*,
                    u.email as created_by_email,
                    COUNT(*) OVER() as total_count
                FROM bottles b
                LEFT JOIN users u ON b.created_by = u.id
                ${whereClause}
                ORDER BY b.created_at DESC
                LIMIT $${paramCount++} OFFSET $${paramCount}
            `;

            queryParams.push(limit, offset);
            const result = await pool.query(query, queryParams);

            const bottles = result.rows.map(row => ({
                ...new Bottle(row),
                createdByEmail: row.created_by_email,
                totalCount: parseInt(row.total_count) || 0
            }));

            return bottles;
        } catch (error) {
            console.error('Error getting bottles:', error);
            throw error;
        }
    }

    // Update bottle
    static async update(id, updateData, updatedByUserId) {
        try {
            const { bottleType, description, status, batchNumber, expiryDate } = updateData;
            const currentBottle = await this.findById(id);

            if (!currentBottle) {
                throw new Error('Bottle not found');
            }

            let updateFields = [];
            let values = [];
            let paramCount = 1;

            if (bottleType && bottleType !== currentBottle.bottleType) {
                // Generate new QR code if bottle type changes
                const newQRCode = await this.generateQRCode(currentBottle.bottleCode, bottleType);
                updateFields.push(`bottle_type = $${paramCount++}, qr_code_data = $${paramCount++}`);
                values.push(bottleType, newQRCode);
            }

            if (description !== undefined) {
                updateFields.push(`description = $${paramCount++}`);
                values.push(description);
            }

            if (batchNumber !== undefined) {
                updateFields.push(`batch_number = $${paramCount++}`);
                values.push(batchNumber);
            }

            if (expiryDate !== undefined) {
                updateFields.push(`expiry_date = $${paramCount++}`);
                values.push(expiryDate);
            }

            // Handle status change
            if (status && status !== currentBottle.status) {
                updateFields.push(`status = $${paramCount++}, last_status_change = CURRENT_TIMESTAMP`);
                values.push(status);

                // Log status change
                await this.logStatusChange(
                    id,
                    currentBottle.status,
                    status,
                    updatedByUserId,
                    `Status changed from ${currentBottle.status} to ${status}`
                );
            }

            if (updateFields.length === 0) {
                return currentBottle;
            }

            updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(id);

            const query = `
                UPDATE bottles 
                SET ${updateFields.join(', ')} 
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await pool.query(query, values);
            return result.rows.length > 0 ? new Bottle(result.rows[0]) : null;
        } catch (error) {
            console.error('Error updating bottle:', error);
            throw error;
        }
    }

    // Delete bottle
    static async delete(id) {
        try {
            const result = await pool.query(
                'DELETE FROM bottles WHERE id = $1 RETURNING *',
                [id]
            );
            return result.rows.length > 0;
        } catch (error) {
            console.error('Error deleting bottle:', error);
            return false;
        }
    }

    // Log status changes
    static async logStatusChange(bottleId, previousStatus, newStatus, changedByUserId, reason = null) {
        try {
            await pool.query(`
                INSERT INTO bottle_history (bottle_id, previous_status, new_status, changed_by, change_reason)
                VALUES ($1, $2, $3, $4, $5)
            `, [bottleId, previousStatus, newStatus, changedByUserId, reason]);
        } catch (error) {
            console.error('Error logging status change:', error);
        }
    }

    // Get bottle history
    static async getHistory(bottleId) {
        try {
            const result = await pool.query(`
                SELECT 
                    bh.*,
                    u.email as changed_by_email
                FROM bottle_history bh
                LEFT JOIN users u ON bh.changed_by = u.id
                WHERE bh.bottle_id = $1
                ORDER BY bh.changed_at DESC
            `, [bottleId]);

            return result.rows;
        } catch (error) {
            console.error('Error getting bottle history:', error);
            return [];
        }
    }

    // Get statistics
    static async getStatistics() {
        try {
            const result = await pool.query(`
                SELECT 
                    COUNT(*) as total_bottles,
                    COUNT(CASE WHEN status = 'AtPlant' THEN 1 END) as at_plant,
                    COUNT(CASE WHEN status = 'AtCustomer' THEN 1 END) as at_customer,
                    COUNT(CASE WHEN status = 'AtVehicle' THEN 1 END) as at_vehicle,
                    COUNT(CASE WHEN bottle_type = '0.5L' THEN 1 END) as half_liter,
                    COUNT(CASE WHEN bottle_type = '1L' THEN 1 END) as one_liter,
                    COUNT(CASE WHEN bottle_type = '5L' THEN 1 END) as five_liter,
                    COUNT(CASE WHEN bottle_type = '20L' THEN 1 END) as twenty_liter,
                    COUNT(CASE WHEN expiry_date < CURRENT_DATE THEN 1 END) as expired,
                    COUNT(CASE WHEN expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' THEN 1 END) as expiring_soon
                FROM bottles
            `);

            return result.rows[0];
        } catch (error) {
            console.error('Error getting bottle statistics:', error);
            return {};
        }
    }

    // Transfer bottle from plant to vehicle
    static async transferToVehicle(bottleCode, vehicleId, scannedBy, scanMethod = 'qr') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get bottle details
            const bottleResult = await client.query(
                'SELECT * FROM bottles WHERE bottle_code = $1',
                [bottleCode]
            );

            if (bottleResult.rows.length === 0) {
                throw new Error('Bottle not found');
            }

            const bottle = bottleResult.rows[0];

            if (bottle.status !== 'AtPlant') {
                throw new Error(`Bottle is currently ${bottle.status}, cannot transfer from plant`);
            }

            // Update bottle status and vehicle
            await client.query(
                'UPDATE bottles SET status = $1, current_vehicle_id = $2, last_status_change = CURRENT_TIMESTAMP WHERE id = $3',
                ['AtVehicle', vehicleId, bottle.id]
            );

            // Log transfer
            await client.query(`
                INSERT INTO bottle_transfers (
                    bottle_id, from_location, to_location, to_vehicle_id, 
                    scanned_by, scan_method, transfer_reason
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                bottle.id, 'Plant', 'Vehicle', vehicleId,
                scannedBy, scanMethod, 'Plant to vehicle transfer'
            ]);

            // Log status change
            await this.logStatusChange(bottle.id, 'AtPlant', 'AtVehicle', scannedBy, 'Transferred to vehicle');

            await client.query('COMMIT');
            return { success: true, message: 'Bottle transferred to vehicle successfully' };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Transfer bottle from customer back to plant (for refillable bottles)
    static async returnToPlant(bottleCode, scannedBy, scanMethod = 'qr', fromVehicleId = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get bottle details
            const bottleResult = await client.query(
                'SELECT * FROM bottles WHERE bottle_code = $1',
                [bottleCode]
            );

            if (bottleResult.rows.length === 0) {
                throw new Error('Bottle not found');
            }

            const bottle = bottleResult.rows[0];

            if (!bottle.is_refillable) {
                throw new Error('Non-refillable bottles cannot be returned to plant');
            }

            if (bottle.status !== 'AtCustomer' && bottle.status !== 'AtVehicle') {
                throw new Error(`Bottle is currently ${bottle.status}, cannot return to plant`);
            }

            const fromLocation = bottle.status === 'AtCustomer' ? 'Customer' : 'Vehicle';

            // Update bottle status
            await client.query(
                'UPDATE bottles SET status = $1, current_vehicle_id = NULL, last_status_change = CURRENT_TIMESTAMP WHERE id = $2',
                ['AtPlant', bottle.id]
            );

            // Log transfer
            await client.query(`
                INSERT INTO bottle_transfers (
                    bottle_id, from_location, to_location, from_vehicle_id, 
                    scanned_by, scan_method, transfer_reason
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                bottle.id, fromLocation, 'Plant', fromVehicleId,
                scannedBy, scanMethod, 'Returned to plant for refill'
            ]);

            // Log status change
            await this.logStatusChange(bottle.id, bottle.status, 'AtPlant', scannedBy, 'Returned to plant for refill');

            await client.query('COMMIT');
            return { success: true, message: 'Bottle returned to plant successfully' };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Get vehicle inventory
    static async getVehicleInventory(vehicleId) {
        try {
            const result = await pool.query(`
                SELECT b.*, bt.transferred_at as loaded_at
                FROM bottles b
                LEFT JOIN bottle_transfers bt ON b.id = bt.bottle_id 
                    AND bt.to_vehicle_id = $1 
                    AND bt.to_location = 'Vehicle'
                WHERE b.current_vehicle_id = $1 AND b.status = 'AtVehicle'
                ORDER BY bt.transferred_at DESC
            `, [vehicleId]);

            return result.rows.map(row => new Bottle(row));
        } catch (error) {
            console.error('Error getting vehicle inventory:', error);
            throw error;
        }
    }

    // Get bottles at plant (available for loading)
    static async getPlantInventory(filter = {}) {
        try {
            let query = `
                SELECT b.*, u.email as created_by_email 
                FROM bottles b
                LEFT JOIN users u ON b.created_by = u.id
                WHERE b.status = 'AtPlant'
            `;

            const params = [];
            let paramCount = 1;

            if (filter.bottleType) {
                query += ` AND b.bottle_type = $${paramCount++}`;
                params.push(filter.bottleType);
            }

            if (filter.isRefillable !== undefined) {
                query += ` AND b.is_refillable = $${paramCount++}`;
                params.push(filter.isRefillable);
            }

            query += ' ORDER BY b.created_at DESC';

            const result = await pool.query(query, params);
            return result.rows.map(row => new Bottle(row));
        } catch (error) {
            console.error('Error getting plant inventory:', error);
            throw error;
        }
    }

    // Get bottle transfer history
    static async getTransferHistory(bottleCode) {
        try {
            const result = await pool.query(`
                SELECT 
                    bt.*,
                    b.bottle_code,
                    b.bottle_type,
                    u.email as scanned_by_email,
                    v1.license_plate as from_vehicle_plate,
                    v2.license_plate as to_vehicle_plate,
                    c.full_name as customer_name
                FROM bottle_transfers bt
                JOIN bottles b ON bt.bottle_id = b.id
                LEFT JOIN users u ON bt.scanned_by = u.id
                LEFT JOIN vehicles v1 ON bt.from_vehicle_id = v1.id
                LEFT JOIN vehicles v2 ON bt.to_vehicle_id = v2.id
                LEFT JOIN customers c ON bt.customer_id = c.id
                WHERE b.bottle_code = $1
                ORDER BY bt.transferred_at DESC
            `, [bottleCode]);

            return result.rows;
        } catch (error) {
            console.error('Error getting transfer history:', error);
            throw error;
        }
    }

    // Convert to JSON with formatted dates
    toJSON() {
        return {
            id: this.id,
            bottleCode: this.bottleCode,
            bottleType: this.bottleType,
            qrCodeData: this.qrCodeData,
            status: this.status,
            isRefillable: this.isRefillable,
            currentVehicleId: this.currentVehicleId,
            description: this.description,
            manufacturingDate: moment(this.manufacturingDate).format('YYYY-MM-DD'),
            expiryDate: moment(this.expiryDate).format('YYYY-MM-DD'),
            batchNumber: this.batchNumber,
            createdBy: this.createdBy,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            lastStatusChange: this.lastStatusChange,
            isExpired: moment(this.expiryDate).isBefore(moment()),
            isExpiringSoon: moment(this.expiryDate).isBetween(moment(), moment().add(30, 'days'))
        };
    }
}

module.exports = Bottle;