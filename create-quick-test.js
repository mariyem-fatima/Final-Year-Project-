const { pool } = require('./models/database');

async function createQuickTest() {
    try {
        const today = '2025-10-22';
        
        // First delete any existing assignment for today for driver 2
        await pool.query(`
            DELETE FROM order_assignments 
            WHERE driver_id = 2 AND assigned_date = $1
        `, [today]);
        
        // Insert a simple assignment for today
        const result = await pool.query(`
            INSERT INTO order_assignments (order_id, driver_id, assigned_date, delivery_status) 
            VALUES (1, 2, $1, 'assigned') 
            RETURNING *
        `, [today]);
        
        console.log('✅ Test assignment created:', result.rows[0]);
        
        // Verify with full details
        const check = await pool.query(`
            SELECT 
                oa.id, oa.order_id, oa.driver_id, oa.assigned_date, oa.delivery_status,
                o.order_number, c.full_name as customer_name, c.address_line1
            FROM order_assignments oa 
            JOIN orders o ON oa.order_id = o.id 
            JOIN customers c ON o.customer_id = c.id 
            WHERE oa.driver_id = 2 AND oa.assigned_date = $1
        `, [today]);
        
        console.log('✅ Assignment details:', check.rows[0]);
        console.log('\n🚚 Now login as driver@waterplant.com to test!');
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

createQuickTest();