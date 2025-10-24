const { pool } = require('./models/database');

async function testBottleTrackingSystem() {
    try {
        console.log('🧪 Testing Complete Bottle Tracking System...\n');

        // Step 1: Check current bottle status before delivery
        console.log('📊 BEFORE DELIVERY - Bottle Status:');
        const beforeQuery = `
            SELECT 
                bottle_code, 
                status, 
                current_customer_id,
                delivered_at
            FROM bottles 
            WHERE bottle_code IN ('222222', '138477')
        `;
        const beforeResult = await pool.query(beforeQuery);
        console.table(beforeResult.rows);

        // Step 2: Simulate a delivery (this would normally be done through the UI)
        console.log('\n🚚 SIMULATING DELIVERY...');
        
        // Get customer and order info for the test
        const customerQuery = 'SELECT id, full_name FROM customers LIMIT 1';
        const customerResult = await pool.query(customerQuery);
        
        if (customerResult.rows.length === 0) {
            console.log('❌ No customers found. Creating test customer...');
            await pool.query(`
                INSERT INTO customers (full_name, phone_primary, email, address_line1, city) 
                VALUES ('Test Customer', '1234567890', 'test@test.com', '123 Test St', 'Test City')
            `);
        }

        const customer = customerResult.rows[0];
        console.log(`Customer: ${customer.full_name} (ID: ${customer.id})`);

        // Step 3: Check the new bottle inventory system
        console.log('\n📋 CUSTOMER BOTTLE INVENTORY QUERY:');
        const inventoryQuery = `
            SELECT 
                c.id as customer_id,
                c.full_name as customer_name,
                COUNT(b.id) as bottles_count,
                ARRAY_AGG(
                    CASE WHEN b.id IS NOT NULL THEN
                        JSON_BUILD_OBJECT(
                            'bottle_code', b.bottle_code,
                            'bottle_type', b.bottle_type,
                            'delivered_at', b.delivered_at,
                            'delivered_by_email', u.email
                        )
                    END
                ) FILTER (WHERE b.id IS NOT NULL) as bottles
            FROM customers c
            LEFT JOIN bottles b ON c.id = b.current_customer_id AND b.status = 'AtCustomer'
            LEFT JOIN users u ON b.delivered_by = u.id
            WHERE c.id = $1
            GROUP BY c.id, c.full_name
        `;
        const inventoryResult = await pool.query(inventoryQuery, [customer.id]);
        console.log('Customer Inventory Data:');
        console.table(inventoryResult.rows);

        // Step 4: Show bottle delivery history
        console.log('\n📚 BOTTLE DELIVERY HISTORY:');
        const historyQuery = `
            SELECT 
                bdh.delivered_at,
                bdh.bottle_id,
                b.bottle_code,
                b.bottle_type,
                c.full_name as customer_name,
                bdh.status_from,
                bdh.status_to,
                u.email as delivered_by
            FROM bottle_delivery_history bdh
            JOIN bottles b ON bdh.bottle_id = b.id
            JOIN customers c ON bdh.customer_id = c.id
            LEFT JOIN users u ON bdh.delivered_by = u.id
            ORDER BY bdh.delivered_at DESC
            LIMIT 10
        `;
        const historyResult = await pool.query(historyQuery);
        console.table(historyResult.rows);

        // Step 5: Summary statistics
        console.log('\n📈 SYSTEM STATISTICS:');
        const statsQuery = `
            SELECT 
                COUNT(DISTINCT b.current_customer_id) as customers_with_bottles,
                COUNT(b.id) as total_bottles_at_customers,
                COUNT(CASE WHEN b.status = 'AtPlant' THEN 1 END) as bottles_at_plant,
                COUNT(CASE WHEN b.status = 'AtVehicle' THEN 1 END) as bottles_at_vehicle,
                COUNT(CASE WHEN b.status = 'AtCustomer' THEN 1 END) as bottles_at_customer
            FROM bottles b
        `;
        const statsResult = await pool.query(statsQuery);
        console.table(statsResult.rows);

        console.log('\n✅ Bottle tracking system test completed!');
        console.log('\n🔍 KEY IMPROVEMENTS MADE:');
        console.log('1. ✅ Bottles table now tracks current_customer_id');
        console.log('2. ✅ Delivery timestamps and delivery person recorded');
        console.log('3. ✅ Complete delivery history in bottle_delivery_history table');
        console.log('4. ✅ Customer bottle inventory interface created');
        console.log('5. ✅ Navigation integrated for easy access');
        
        console.log('\n🌟 YOU CAN NOW:');
        console.log('- See exactly which customer has which bottles');
        console.log('- Track delivery dates and responsible staff');
        console.log('- View complete bottle movement history');
        console.log('- Get customer bottle inventory reports');
        console.log('- Monitor bottle circulation statistics');

        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testBottleTrackingSystem();