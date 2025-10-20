const { pool } = require('./database');
const QRCode = require('qrcode');
const moment = require('moment');

class BottleTracking {
    constructor(data = {}) {
        this.id = data.id;
        this.bottle_id = data.bottle_id;
        this.order_id = data.order_id;
        this.assignment_id = data.assignment_id;
        this.current_status = data.current_status;
        this.current_location = data.current_location;
        this.vehicle_id = data.vehicle_id;
        this.customer_id = data.customer_id;
        this.driver_id = data.driver_id;
    }

    // Assign bottles to an order
    static async assignBottlesToOrder(orderData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { order_id, assignment_id, bottle_type, quantity_needed, driver_id, vehicle_id } = orderData;

            // Find available bottles at plant
            const availableBottles = await client.query(`
                SELECT id, bottle_code FROM bottles 
                WHERE bottle_type = $1 
                AND status = 'at_plant' 
                AND (current_location IS NULL OR current_location = 'plant')
                ORDER BY manufacturing_date ASC
                LIMIT $2
            `, [bottle_type, quantity_needed]);

            if (availableBottles.rows.length < quantity_needed) {
                throw new Error(`Not enough bottles available. Need ${quantity_needed}, found ${availableBottles.rows.length}`);
            }

            const assignedBottles = [];

            for (const bottle of availableBottles.rows) {
                // Update bottle status and location
                await client.query(`
                    UPDATE bottles 
                    SET status = 'at_vehicle', 
                        current_location = 'vehicle_' || $1,
                        current_vehicle_id = $1,
                        last_status_change = NOW(),
                        last_location_update = NOW()
                    WHERE id = $2
                `, [vehicle_id, bottle.id]);

                // Create order_bottles record
                const orderBottle = await client.query(`
                    INSERT INTO order_bottles (order_id, assignment_id, bottle_id, status)
                    VALUES ($1, $2, $3, 'assigned')
                    RETURNING *
                `, [order_id, assignment_id, bottle.id]);

                // Log movement
                await client.query(`
                    INSERT INTO bottle_movements (
                        bottle_id, order_id, assignment_id, from_status, to_status,
                        from_location, to_location, vehicle_id, driver_id,
                        movement_type, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                `, [
                    bottle.id, order_id, assignment_id, 'at_plant', 'at_vehicle',
                    'plant', `vehicle_${vehicle_id}`, vehicle_id, driver_id,
                    'pickup', `Bottle assigned to order and loaded to vehicle`
                ]);

                assignedBottles.push({
                    bottle_id: bottle.id,
                    bottle_code: bottle.bottle_code,
                    order_bottle_id: orderBottle.rows[0].id
                });
            }

            await client.query('COMMIT');
            return assignedBottles;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Mark bottles as delivered
    static async markBottlesDelivered(deliveryData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { assignment_id, delivered_bottle_ids, customer_id, driver_id } = deliveryData;

            for (const bottle_id of delivered_bottle_ids) {
                // Update bottle status
                await client.query(`
                    UPDATE bottles 
                    SET status = 'at_customer',
                        current_location = 'customer_' || $1,
                        current_customer_id = $1,
                        current_vehicle_id = NULL,
                        last_status_change = NOW(),
                        last_location_update = NOW()
                    WHERE id = $2
                `, [customer_id, bottle_id]);

                // Update order_bottles
                await client.query(`
                    UPDATE order_bottles 
                    SET status = 'delivered', delivery_date = NOW()
                    WHERE bottle_id = $1 AND assignment_id = $2
                `, [bottle_id, assignment_id]);

                // Log movement
                await client.query(`
                    INSERT INTO bottle_movements (
                        bottle_id, assignment_id, from_status, to_status,
                        from_location, to_location, customer_id, driver_id,
                        movement_type, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `, [
                    bottle_id, assignment_id, 'at_vehicle', 'at_customer',
                    `vehicle`, `customer_${customer_id}`, customer_id, driver_id,
                    'delivery', 'Bottle delivered to customer'
                ]);
            }

            await client.query('COMMIT');
            return true;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Return bottles from customer
    static async returnBottlesFromCustomer(returnData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { customer_id, returned_bottle_ids, vehicle_id, driver_id, return_reason } = returnData;

            for (const bottle_id of returned_bottle_ids) {
                // Update bottle status
                await client.query(`
                    UPDATE bottles 
                    SET status = 'at_vehicle',
                        current_location = 'vehicle_' || $1,
                        current_vehicle_id = $1,
                        current_customer_id = NULL,
                        last_status_change = NOW(),
                        last_location_update = NOW()
                    WHERE id = $2
                `, [vehicle_id, bottle_id]);

                // Log movement
                await client.query(`
                    INSERT INTO bottle_movements (
                        bottle_id, from_status, to_status,
                        from_location, to_location, vehicle_id, customer_id, driver_id,
                        movement_type, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `, [
                    bottle_id, 'at_customer', 'at_vehicle',
                    `customer_${customer_id}`, `vehicle_${vehicle_id}`, 
                    vehicle_id, customer_id, driver_id,
                    'return', return_reason || 'Bottle returned from customer'
                ]);
            }

            await client.query('COMMIT');
            return true;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Get bottle tracking history
    static async getBottleHistory(bottle_id) {
        const query = `
            SELECT 
                bm.*,
                o.order_number,
                c.full_name as customer_name,
                d.full_name as driver_name,
                v.license_plate as vehicle_plate
            FROM bottle_movements bm
            LEFT JOIN orders o ON bm.order_id = o.id
            LEFT JOIN customers c ON bm.customer_id = c.id
            LEFT JOIN drivers d ON bm.driver_id = d.id
            LEFT JOIN vehicles v ON bm.vehicle_id = v.id
            WHERE bm.bottle_id = $1
            ORDER BY bm.movement_date DESC
        `;
        
        const result = await pool.query(query, [bottle_id]);
        return result.rows;
    }

    // Get bottles for an order
    static async getOrderBottles(order_id) {
        const query = `
            SELECT 
                ob.*,
                b.bottle_code,
                b.bottle_type,
                b.status as bottle_status,
                b.current_location,
                b.qr_code_data
            FROM order_bottles ob
            JOIN bottles b ON ob.bottle_id = b.id
            WHERE ob.order_id = $1
            ORDER BY ob.assigned_date DESC
        `;
        
        const result = await pool.query(query, [order_id]);
        return result.rows;
    }

    // Scan QR code and get bottle info
    static async scanBottleQR(qr_data) {
        try {
            const qrInfo = JSON.parse(qr_data);
            const bottle_code = qrInfo.code;

            const query = `
                SELECT 
                    b.*,
                    ob.order_id,
                    ob.assignment_id,
                    o.order_number,
                    c.full_name as customer_name
                FROM bottles b
                LEFT JOIN order_bottles ob ON b.id = ob.bottle_id AND ob.status IN ('assigned', 'loaded', 'delivered')
                LEFT JOIN orders o ON ob.order_id = o.id
                LEFT JOIN customers c ON o.customer_id = c.id
                WHERE b.bottle_code = $1
            `;

            const result = await pool.query(query, [bottle_code]);
            return result.rows[0] || null;

        } catch (error) {
            throw new Error('Invalid QR code data');
        }
    }

    // Get vehicle bottle inventory
    static async getVehicleBottles(vehicle_id) {
        const query = `
            SELECT 
                b.*,
                ob.order_id,
                ob.status as order_status,
                o.order_number,
                c.full_name as customer_name
            FROM bottles b
            LEFT JOIN order_bottles ob ON b.id = ob.bottle_id AND ob.status IN ('assigned', 'loaded')
            LEFT JOIN orders o ON ob.order_id = o.id
            LEFT JOIN customers c ON o.customer_id = c.id
            WHERE b.current_vehicle_id = $1 AND b.status = 'at_vehicle'
            ORDER BY b.bottle_type, ob.order_id
        `;
        
        const result = await pool.query(query, [vehicle_id]);
        return result.rows;
    }
}

module.exports = BottleTracking;