const { pool } = require('./database');

class OrderAssignment {
    constructor(data = {}) {
        this.id = data.id;
        this.order_id = data.order_id;
        this.driver_id = data.driver_id;
        this.vehicle_id = data.vehicle_id;
        this.assigned_date = data.assigned_date;
        this.delivery_sequence = data.delivery_sequence;
        this.estimated_delivery_time = data.estimated_delivery_time;
        this.actual_delivery_time = data.actual_delivery_time;
        this.delivery_status = data.delivery_status || 'assigned';
        this.notes = data.notes;
        this.assigned_by = data.assigned_by;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
        
        // Joined fields
        this.order_number = data.order_number;
        this.customer_name = data.customer_name;
        this.customer_phone = data.customer_phone;
        this.customer_address = data.customer_address;
        this.bottle_type = data.bottle_type;
        this.quantity_per_delivery = data.quantity_per_delivery;
        this.priority_level = data.priority_level;
        this.driver_name = data.driver_name;
        this.driver_phone = data.driver_phone;
        this.vehicle_license_plate = data.vehicle_license_plate;
        this.vehicle_type = data.vehicle_type;
    }

    // Find assignment by ID
    static async findById(assignmentId) {
        try {
            const query = `
                SELECT 
                    oa.*,
                    o.order_number, o.bottle_type, o.quantity_per_delivery, o.priority_level,
                    c.full_name as customer_name, c.phone_primary as customer_phone,
                    COALESCE(o.delivery_address, c.address_line1) as customer_address,
                    c.city as customer_city,
                    d.full_name as driver_name, d.phone_primary as driver_phone,
                    v.license_plate as vehicle_license_plate, v.vehicle_type
                FROM order_assignments oa
                LEFT JOIN orders o ON oa.order_id = o.id
                LEFT JOIN customers c ON o.customer_id = c.id
                LEFT JOIN drivers d ON oa.driver_id = d.id
                LEFT JOIN vehicles v ON oa.vehicle_id = v.id
                WHERE oa.id = $1
            `;

            const result = await pool.query(query, [assignmentId]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return new OrderAssignment(result.rows[0]);
        } catch (error) {
            throw error;
        }
    }

    // Assign order to driver for a specific date
    static async assignOrder(orderData, userId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                order_id,
                driver_id,
                vehicle_id,
                assigned_date,
                delivery_sequence,
                estimated_delivery_time,
                notes
            } = orderData;

            // Validate required fields to prevent NaN errors
            const orderIdNum = parseInt(order_id);
            const driverIdNum = parseInt(driver_id);
            
            if (!order_id || isNaN(orderIdNum) || orderIdNum <= 0) {
                throw new Error('Valid order_id is required');
            }
            
            if (!driver_id || isNaN(driverIdNum) || driverIdNum <= 0) {
                throw new Error('Valid driver_id is required');
            }
            
            if (!assigned_date) {
                throw new Error('assigned_date is required');
            }

            // Check if order is already assigned for this date
            const existingAssignment = await client.query(
                'SELECT id FROM order_assignments WHERE order_id = $1 AND assigned_date = $2',
                [orderIdNum, assigned_date]
            );

            if (existingAssignment.rows.length > 0) {
                throw new Error('Order already assigned for this date');
            }

            // Verify driver and vehicle are available
            if (driver_id) {
                const driverCheck = await client.query(
                    'SELECT id, status FROM drivers WHERE id = $1',
                    [driverIdNum]
                );
                
                if (driverCheck.rows.length === 0 || driverCheck.rows[0].status !== 'active') {
                    throw new Error('Driver not available');
                }
            }

            // Insert assignment
            const query = `
                INSERT INTO order_assignments (
                    order_id, driver_id, vehicle_id, assigned_date,
                    delivery_sequence, estimated_delivery_time, notes, assigned_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `;

            const result = await client.query(query, [
                orderIdNum,
                driverIdNum,
                vehicle_id || null,
                assigned_date,
                delivery_sequence || null,
                estimated_delivery_time || null,
                notes || null,
                userId
            ]);

            const assignment = result.rows[0];

            // Auto-assign bottles to this order if vehicle is specified
            if (vehicle_id && assignment) {
                try {
                    const BottleTracking = require('./BottleTracking');
                    
                    // Get order details for bottle assignment
                    const orderQuery = await client.query(
                        'SELECT bottle_type, quantity_per_delivery FROM orders WHERE id = $1',
                        [orderIdNum]
                    );
                    
                    if (orderQuery.rows.length > 0) {
                        const order = orderQuery.rows[0];
                        
                        // Assign bottles to this order
                        await BottleTracking.assignBottlesToOrder({
                            order_id: orderIdNum,
                            assignment_id: assignment.id,
                            bottle_type: order.bottle_type,
                            quantity_needed: order.quantity_per_delivery,
                            driver_id: driverIdNum,
                            vehicle_id: parseInt(vehicle_id)
                        });
                        
                        console.log(`✅ Auto-assigned ${order.quantity_per_delivery} bottles to order ${orderIdNum}`);
                    }
                } catch (bottleError) {
                    console.warn('Warning: Could not auto-assign bottles:', bottleError.message);
                    // Don't fail the assignment if bottle assignment fails
                }
            }

            await client.query('COMMIT');
            return new OrderAssignment(assignment);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Get all assignments for a specific date
    static async getAssignmentsForDate(date) {
        try {
            const query = `
                SELECT 
                    oa.*,
                    o.order_number, o.bottle_type, o.quantity_per_delivery, o.priority_level,
                    c.full_name as customer_name, c.phone_primary as customer_phone,
                    COALESCE(o.delivery_address, c.address_line1) as customer_address,
                    c.city as customer_city,
                    d.full_name as driver_name, d.phone_primary as driver_phone,
                    v.license_plate as vehicle_license_plate, v.vehicle_type,
                    u.email as assigned_by_email
                FROM order_assignments oa
                LEFT JOIN orders o ON oa.order_id = o.id
                LEFT JOIN customers c ON o.customer_id = c.id
                LEFT JOIN drivers d ON oa.driver_id = d.id
                LEFT JOIN vehicles v ON oa.vehicle_id = v.id
                LEFT JOIN users u ON oa.assigned_by = u.id
                WHERE oa.assigned_date = $1
                ORDER BY oa.delivery_sequence ASC, oa.estimated_delivery_time ASC, oa.created_at ASC
            `;

            const result = await pool.query(query, [date]);
            return result.rows.map(row => new OrderAssignment(row));
        } catch (error) {
            throw error;
        }
    }

    // Get assignments for a specific driver on a date
    static async getDriverAssignments(driverId, date) {
        try {
            const query = `
                SELECT 
                    oa.*,
                    o.order_number, o.bottle_type, o.quantity_per_delivery, o.priority_level,
                    c.full_name as customer_name, c.phone_primary as customer_phone,
                    COALESCE(o.delivery_address, c.address_line1) as customer_address,
                    c.city as customer_city,
                    v.license_plate as vehicle_license_plate, v.vehicle_type
                FROM order_assignments oa
                LEFT JOIN orders o ON oa.order_id = o.id
                LEFT JOIN customers c ON o.customer_id = c.id
                LEFT JOIN vehicles v ON oa.vehicle_id = v.id
                WHERE oa.driver_id = $1 AND oa.assigned_date = $2
                ORDER BY oa.delivery_sequence ASC, oa.estimated_delivery_time ASC
            `;

            const result = await pool.query(query, [driverId, date]);
            return result.rows.map(row => new OrderAssignment(row));
        } catch (error) {
            throw error;
        }
    }

    // Get unassigned orders for a date
    static async getUnassignedOrders(date) {
        try {
            const query = `
                SELECT 
                    o.id, o.order_number, o.bottle_type, o.quantity_per_delivery, 
                    o.priority_level, o.next_delivery_date,
                    c.full_name as customer_name, c.phone_primary as customer_phone,
                    COALESCE(o.delivery_address, c.address_line1) as customer_address,
                    c.city as customer_city, c.area
                FROM orders o
                LEFT JOIN customers c ON o.customer_id = c.id
                LEFT JOIN order_assignments oa ON o.id = oa.order_id AND oa.assigned_date = $1
                WHERE o.next_delivery_date <= $1
                AND o.order_status IN ('pending', 'confirmed', 'in-progress')
                AND o.bottles_remaining > 0
                AND oa.id IS NULL
                ORDER BY 
                    CASE o.priority_level 
                        WHEN 'urgent' THEN 4 
                        WHEN 'high' THEN 3 
                        WHEN 'normal' THEN 2 
                        WHEN 'low' THEN 1 
                    END DESC,
                    o.next_delivery_date ASC
            `;

            const result = await pool.query(query, [date]);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    // Update assignment status
    static async updateStatus(assignmentId, newStatus, userId, notes = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Update assignment status
            const assignmentQuery = `
                UPDATE order_assignments 
                SET delivery_status = $1::VARCHAR,
                    notes = COALESCE($2::TEXT, notes),
                    actual_delivery_time = CASE 
                        WHEN $1::VARCHAR = 'delivered' THEN CURRENT_TIME 
                        ELSE actual_delivery_time 
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3::INTEGER
                RETURNING *
            `;
            
            const assignmentResult = await client.query(assignmentQuery, [newStatus, notes, assignmentId]);
            
            if (assignmentResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return null;
            }
            
            const assignment = assignmentResult.rows[0];
            
            // If delivery is completed, update order status and delivery tracking
            if (newStatus === 'delivered') {
                // Update order status to in-progress and increment bottles_delivered
                const orderUpdateQuery = `
                    UPDATE orders 
                    SET bottles_delivered = bottles_delivered + quantity_per_delivery,
                        bottles_remaining = bottles_remaining - quantity_per_delivery,
                        order_status = CASE 
                            WHEN bottles_remaining - quantity_per_delivery <= 0 THEN 'completed'
                            ELSE 'in-progress'
                        END,
                        last_delivery_date = CURRENT_DATE,
                        next_delivery_date = CASE 
                            WHEN order_type = 'subscription' AND bottles_remaining - quantity_per_delivery > 0 
                            THEN CASE subscription_type
                                WHEN 'monthly' THEN CURRENT_DATE + INTERVAL '1 month'
                                WHEN 'parallel-1day' THEN CURRENT_DATE + INTERVAL '1 day'
                                WHEN 'parallel-2day' THEN CURRENT_DATE + INTERVAL '2 days'
                                WHEN 'parallel-3day' THEN CURRENT_DATE + INTERVAL '3 days'
                                ELSE next_delivery_date
                            END
                            ELSE NULL
                        END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `;
                
                await client.query(orderUpdateQuery, [assignment.order_id]);
            }
            
            await client.query('COMMIT');
            return new OrderAssignment(assignment);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Auto-assign orders based on criteria
    static async autoAssignOrders(date, criteria = {}) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get unassigned orders
            const unassignedOrders = await this.getUnassignedOrders(date);
            
            // Get available drivers with their vehicles
            const availableDriversQuery = `
                SELECT 
                    d.id, d.full_name, d.assigned_vehicle_id,
                    v.id as vehicle_id, v.license_plate, v.capacity,
                    COALESCE(COUNT(oa.id), 0) as current_assignments
                FROM drivers d
                LEFT JOIN vehicles v ON d.assigned_vehicle_id = v.id
                LEFT JOIN order_assignments oa ON d.id = oa.driver_id AND oa.assigned_date = $1 AND oa.delivery_status != 'delivered'
                WHERE d.status = 'active'
                GROUP BY d.id, d.full_name, d.assigned_vehicle_id, v.id, v.license_plate, v.capacity
                HAVING COALESCE(COUNT(oa.id), 0) < $2
                ORDER BY COALESCE(COUNT(oa.id), 0) ASC
            `;

            const maxOrdersPerDriver = criteria.maxOrdersPerDriver || 10;
            const availableDrivers = await client.query(availableDriversQuery, [date, maxOrdersPerDriver]);

            const assignments = [];
            let driverIndex = 0;

            for (const order of unassignedOrders) {
                if (availableDrivers.rows.length === 0) break;

                const driver = availableDrivers.rows[driverIndex % availableDrivers.rows.length];
                
                try {
                    const assignmentData = {
                        order_id: order.id,
                        driver_id: driver.id,
                        vehicle_id: driver.vehicle_id,
                        assigned_date: date,
                        delivery_sequence: parseInt(driver.current_assignments) + 1
                    };

                    const assignment = await this.assignOrder(assignmentData, criteria.userId || 1);
                    assignments.push(assignment);
                    
                    // Update driver's current assignment count
                    availableDrivers.rows[driverIndex].current_assignments++;
                    
                } catch (error) {
                    console.error(`Failed to assign order ${order.id}:`, error.message);
                }

                driverIndex++;
            }

            await client.query('COMMIT');
            return assignments;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Remove assignment
    static async removeAssignment(assignmentId, userId) {
        try {
            const query = 'DELETE FROM order_assignments WHERE id = $1 RETURNING *';
            const result = await pool.query(query, [assignmentId]);
            return result.rows.length > 0;
        } catch (error) {
            throw error;
        }
    }

    // Get assignment statistics for a date
    static async getAssignmentStats(date) {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_assignments,
                    COUNT(CASE WHEN delivery_status = 'assigned' THEN 1 END) as pending,
                    COUNT(CASE WHEN delivery_status = 'in_progress' THEN 1 END) as in_progress,
                    COUNT(CASE WHEN delivery_status = 'delivered' THEN 1 END) as completed,
                    COUNT(CASE WHEN delivery_status = 'failed' THEN 1 END) as failed,
                    COUNT(DISTINCT driver_id) as drivers_assigned,
                    COUNT(DISTINCT vehicle_id) as vehicles_used
                FROM order_assignments
                WHERE assigned_date = $1
            `;

            const result = await pool.query(query, [date]);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }

    // Bulk assignment update
    static async bulkUpdateStatus(assignmentIds, newStatus, userId) {
        try {
            const query = `
                UPDATE order_assignments 
                SET delivery_status = $1,
                    actual_delivery_time = CASE 
                        WHEN $1 = 'delivered' THEN CURRENT_TIME 
                        ELSE actual_delivery_time 
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ANY($2)
                RETURNING id, order_id, delivery_status
            `;

            const result = await pool.query(query, [newStatus, assignmentIds]);
            return result.rows;
        } catch (error) {
            throw error;
        }
    }

    // Mark delivery as completed with bottle code tracking
    static async markDeliveredWithBottles(assignmentId, bottleCodes, userId, notes) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get assignment details with order and customer info
            const assignmentQuery = `
                SELECT oa.*, o.customer_id, o.quantity_per_delivery
                FROM order_assignments oa
                JOIN orders o ON oa.order_id = o.id
                WHERE oa.id = $1
            `;
            const assignmentResult = await client.query(assignmentQuery, [assignmentId]);
            
            if (assignmentResult.rows.length === 0) {
                throw new Error('Assignment not found');
            }

            const assignment = assignmentResult.rows[0];

            // Validate bottle codes exist and are available
            const bottleValidation = [];
            const deliveredBottles = [];

            for (const bottleCode of bottleCodes) {
                // Check if bottle exists and is available
                const bottleQuery = `
                    SELECT id, bottle_code, bottle_type, status 
                    FROM bottles 
                    WHERE bottle_code = $1
                `;
                const bottleResult = await client.query(bottleQuery, [bottleCode]);

                if (bottleResult.rows.length === 0) {
                    throw new Error(`Bottle code ${bottleCode} not found`);
                }

                const bottle = bottleResult.rows[0];

                if (bottle.status !== 'AtPlant') {
                    throw new Error(`Bottle ${bottleCode} is not available (current status: ${bottle.status})`);
                }

                // Update bottle status to 'AtCustomer'
                await client.query(
                    'UPDATE bottles SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    ['AtCustomer', bottle.id]
                );

                // Log bottle status change
                await client.query(`
                    INSERT INTO bottle_history (bottle_id, previous_status, new_status, changed_by, change_reason)
                    VALUES ($1, $2, $3, $4, $5)
                `, [bottle.id, 'AtPlant', 'AtCustomer', userId, `Delivered to customer via assignment ${assignmentId}`]);

                // Record bottle delivery
                await client.query(`
                    INSERT INTO bottle_deliveries (
                        order_assignment_id, order_id, bottle_id, customer_id, 
                        bottle_code, driver_id, vehicle_id, delivery_notes, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    assignmentId,
                    assignment.order_id,
                    bottle.id,
                    assignment.customer_id,
                    bottleCode,
                    assignment.driver_id,
                    assignment.vehicle_id,
                    notes,
                    userId
                ]);

                deliveredBottles.push({
                    bottle_code: bottleCode,
                    bottle_type: bottle.bottle_type,
                    status: 'AtCustomer'
                });
            }

            // Update assignment status to delivered
            const updateQuery = `
                UPDATE order_assignments 
                SET delivery_status = 'delivered',
                    actual_delivery_time = CURRENT_TIMESTAMP,
                    notes = COALESCE(notes || E'\\n', '') || $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                RETURNING *
            `;
            
            const deliveryNotes = notes ? `Delivered with bottles: ${bottleCodes.join(', ')}. ${notes}` : `Delivered with bottles: ${bottleCodes.join(', ')}`;
            const result = await client.query(updateQuery, [assignmentId, deliveryNotes]);

            await client.query('COMMIT');

            return {
                success: true,
                assignment: new OrderAssignment(result.rows[0]),
                delivered_bottles: deliveredBottles
            };

        } catch (error) {
            await client.query('ROLLBACK');
            return {
                success: false,
                error: error.message
            };
        } finally {
            client.release();
        }
    }
}

module.exports = OrderAssignment;