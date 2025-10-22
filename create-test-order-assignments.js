// Create test order assignments for driver testing
const { pool } = require('./models/database');
const Driver = require('./models/Driver');
const Order = require('./models/Order');
const Customer = require('./models/Customer');
const OrderAssignment = require('./models/OrderAssignment');

async function createTestOrderAssignments() {
    try {
        console.log('Creating test order assignments for driver...');

        // First, check if we have customers and orders
        const customersResult = await pool.query('SELECT * FROM customers LIMIT 1');
        if (customersResult.rows.length === 0) {
            console.log('No customers found. Creating test customer...');
            
            // Create a test customer
            const customerResult = await pool.query(`
                INSERT INTO customers (full_name, phone_primary, address_line1, city, email)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, ['Umer Amin', '03338420501', 'Lane 2 mukaram Town mistrial road Rawalpindi cantt', 'Rawalpindi', 'umer@test.com']);
            
            console.log('✅ Test customer created:', customerResult.rows[0].full_name);
        }

        const customer = customersResult.rows[0] || (await pool.query('SELECT * FROM customers LIMIT 1')).rows[0];

        // Check if we have orders
        const ordersResult = await pool.query('SELECT * FROM orders WHERE customer_id = $1 LIMIT 1', [customer.id]);
        if (ordersResult.rows.length === 0) {
            console.log('No orders found. Creating test order...');
            
            // Create a test order
            const orderResult = await pool.query(`
                INSERT INTO orders (customer_id, bottle_type, quantity_per_delivery, delivery_instructions, order_date, delivery_date, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `, [customer.id, '20L', 5, 'Leave at gate if no one home', new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0], 'confirmed']);
            
            console.log('✅ Test order created:', orderResult.rows[0].id);
        }

        const order = ordersResult.rows[0] || (await pool.query('SELECT * FROM orders WHERE customer_id = $1 LIMIT 1', [customer.id])).rows[0];

        // Find our test driver
        const driver = await Driver.findByUserId(5);
        if (!driver) {
            console.log('❌ Driver not found');
            process.exit(1);
        }

        // Check if assignment already exists
        const existingAssignment = await pool.query(`
            SELECT * FROM order_assignments 
            WHERE driver_id = $1 AND order_id = $2 AND assigned_date = $3
        `, [driver.id, order.id, new Date().toISOString().split('T')[0]]);

        if (existingAssignment.rows.length > 0) {
            console.log('✅ Order assignment already exists');
        } else {
            // Create order assignment
            const assignmentResult = await pool.query(`
                INSERT INTO order_assignments (order_id, driver_id, assigned_date, delivery_status, estimated_delivery_time, delivery_sequence)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [order.id, driver.id, new Date().toISOString().split('T')[0], 'assigned', '10:00', 1]);

            console.log('✅ Order assignment created:', assignmentResult.rows[0].id);
        }

        console.log('\n📋 Test data summary:');
        console.log('- Customer:', customer.full_name);
        console.log('- Order ID:', order.id);
        console.log('- Driver ID:', driver.id);
        console.log('- Assignment Date:', new Date().toISOString().split('T')[0]);
        console.log('\nNow login as driver@waterplant.com / password123 to test!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createTestOrderAssignments();