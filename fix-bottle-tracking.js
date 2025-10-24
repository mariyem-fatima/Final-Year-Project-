const { pool } = require('./models/database');

async function fixBottleTracking() {
    try {
        console.log('🔧 Fixing bottle tracking system...');

        // Step 1: Add customer tracking fields to bottles table
        console.log('📝 Adding customer_id and delivery_date columns...');
        
        await pool.query(`
            ALTER TABLE bottles 
            ADD COLUMN IF NOT EXISTS current_customer_id INTEGER REFERENCES customers(id),
            ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS delivered_by INTEGER REFERENCES users(id)
        `);

        // Step 2: Create a bottle_delivery_history table for complete tracking
        console.log('📚 Creating bottle delivery history table...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bottle_delivery_history (
                id SERIAL PRIMARY KEY,
                bottle_id INTEGER NOT NULL REFERENCES bottles(id),
                customer_id INTEGER NOT NULL REFERENCES customers(id),
                order_id INTEGER REFERENCES orders(id),
                assignment_id INTEGER REFERENCES order_assignments(id),
                delivered_by INTEGER REFERENCES users(id),
                delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status_from VARCHAR(20),
                status_to VARCHAR(20),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Step 3: Add index for better performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_bottle_delivery_history_bottle ON bottle_delivery_history(bottle_id);
            CREATE INDEX IF NOT EXISTS idx_bottle_delivery_history_customer ON bottle_delivery_history(customer_id);
            CREATE INDEX IF NOT EXISTS idx_bottles_current_customer ON bottles(current_customer_id);
        `);

        console.log('✅ Database structure updated successfully!');
        
        // Step 4: Show current state
        const bottlesResult = await pool.query('SELECT bottle_code, status, current_customer_id FROM bottles LIMIT 5');
        console.log('📊 Current bottle status:');
        console.table(bottlesResult.rows);

        process.exit(0);

    } catch (error) {
        console.error('❌ Error fixing bottle tracking:', error.message);
        process.exit(1);
    }
}

fixBottleTracking();