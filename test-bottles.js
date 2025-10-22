const { pool } = require('./models/database');

async function createTestBottles() {
    try {
        console.log('Creating test bottles with different statuses...');
        
        // Create bottles with different statuses for testing
        const bottles = [
            { code: '111111', status: 'AtPlant', description: 'Plant bottle - should work' },
            { code: '222222', status: 'AtVehicle', description: 'Vehicle bottle - should work' },
            { code: '333333', status: 'AtCustomer', description: 'Customer bottle - should NOT work' }
        ];
        
        for (const bottle of bottles) {
            // Check if bottle already exists
            const existing = await pool.query('SELECT id FROM bottles WHERE bottle_code = $1', [bottle.code]);
            
            if (existing.rows.length === 0) {
                await pool.query(`
                    INSERT INTO bottles (bottle_code, bottle_type, qr_code_data, status, description)
                    VALUES ($1, '20L', $2, $3, $4)
                `, [bottle.code, `QR-${bottle.code}`, bottle.status, bottle.description]);
                
                console.log(`✅ Created bottle ${bottle.code} with status ${bottle.status}`);
            } else {
                // Update existing bottle status
                await pool.query(`
                    UPDATE bottles SET status = $1, description = $2 WHERE bottle_code = $3
                `, [bottle.status, bottle.description, bottle.code]);
                
                console.log(`✅ Updated bottle ${bottle.code} to status ${bottle.status}`);
            }
        }
        
        console.log('\n📋 Test Bottles Ready:');
        console.log('- 111111 (AtPlant) - Should work ✅');
        console.log('- 222222 (AtVehicle) - Should work ✅');
        console.log('- 333333 (AtCustomer) - Should fail ❌');
        console.log('\nNow test the delivery with these bottle codes!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createTestBottles();