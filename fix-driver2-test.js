const { pool } = require('./models/database');

async function createTestForDriver2() {
    try {
        console.log('Creating test assignment for driver 2...');
        
        const today = '2025-10-22';
        
        // Insert assignment for driver 2 using order 2
        const result = await pool.query(`
            INSERT INTO order_assignments (order_id, driver_id, vehicle_id, assigned_date, delivery_status, assigned_by)
            VALUES (2, 2, 1, $1, 'assigned', 1)
            RETURNING *
        `, [today]);
        
        console.log('✅ Created assignment:', result.rows[0]);
        
        // Verify with full details
        const verification = await pool.query(`
            SELECT 
                oa.id, oa.driver_id, oa.assigned_date,
                o.order_number, c.full_name, c.address_line1, c.phone_primary
            FROM order_assignments oa 
            JOIN orders o ON oa.order_id = o.id 
            JOIN customers c ON o.customer_id = c.id 
            WHERE oa.id = $1
        `, [result.rows[0].id]);
        
        console.log('✅ Assignment verification:', verification.rows[0]);
        console.log('\n🎯 Now login as driver@waterplant.com / password123');
        console.log('📋 You should see 1 order to click on!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createTestForDriver2();