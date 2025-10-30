const { pool } = require('../models/database');

/**
 * Complete Database Migration - Creates all required tables
 * This migration will run automatically when the server starts
 * and create any missing tables with their proper structure
 */

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Starting database migration...');
        
        // Enable UUID extension
        await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        
        // 1. Users table - Core authentication
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'staff', 'driver', 'user')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Users table created/verified');

        // 2. Session table - For express-session
        await client.query(`
            CREATE TABLE IF NOT EXISTS session (
                sid VARCHAR NOT NULL COLLATE "default",
                sess JSON NOT NULL,
                expire TIMESTAMP(6) NOT NULL
            )
            WITH (OIDS=FALSE);
            
            ALTER TABLE session DROP CONSTRAINT IF EXISTS session_pkey;
            ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
            
            CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
        `);
        console.log('✅ Session table created/verified');

        // 3. Customers table
        await client.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                email VARCHAR(255),
                address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Customers table created/verified');

        // 4. Drivers table
        await client.query(`
            CREATE TABLE IF NOT EXISTS drivers (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                email VARCHAR(255),
                license_number VARCHAR(100),
                address TEXT,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Drivers table created/verified');

        // 5. Staff table
        await client.query(`
            CREATE TABLE IF NOT EXISTS staff (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                email VARCHAR(255),
                department VARCHAR(100),
                position VARCHAR(100),
                salary DECIMAL(10,2),
                hire_date DATE,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Staff table created/verified');

        // 6. Vehicles table
        await client.query(`
            CREATE TABLE IF NOT EXISTS vehicles (
                id SERIAL PRIMARY KEY,
                license_plate VARCHAR(20) UNIQUE NOT NULL,
                make VARCHAR(100),
                model VARCHAR(100),
                year INTEGER,
                capacity INTEGER,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
                driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Vehicles table created/verified');

        // 7. Bottles table
        await client.query(`
            CREATE TABLE IF NOT EXISTS bottles (
                id SERIAL PRIMARY KEY,
                qr_code VARCHAR(255) UNIQUE NOT NULL,
                size VARCHAR(10) NOT NULL CHECK (size IN ('20L', '10L', '5L')),
                status VARCHAR(20) DEFAULT 'plant' CHECK (status IN ('plant', 'delivery', 'customer', 'returned', 'damaged')),
                customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Bottles table created/verified');

        // 8. Orders table
        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                order_number VARCHAR(50) UNIQUE NOT NULL,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                quantity INTEGER NOT NULL DEFAULT 1,
                bottle_size VARCHAR(10) NOT NULL CHECK (bottle_size IN ('20L', '10L', '5L')),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'assigned', 'in_transit', 'delivered', 'cancelled')),
                delivery_date DATE,
                delivery_address TEXT,
                notes TEXT,
                total_amount DECIMAL(10,2) DEFAULT 0,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Orders table created/verified');

        // 9. Order Assignments table
        await client.query(`
            CREATE TABLE IF NOT EXISTS order_assignments (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
                vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'delivered', 'failed')),
                assigned_date DATE DEFAULT CURRENT_DATE,
                delivered_at TIMESTAMP,
                payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed')),
                payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'mobile', 'bank')),
                payment_amount DECIMAL(10,2),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Order Assignments table created/verified');

        // 10. Bottle Tracking table
        await client.query(`
            CREATE TABLE IF NOT EXISTS bottle_tracking (
                id SERIAL PRIMARY KEY,
                bottle_id INTEGER NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
                action VARCHAR(50) NOT NULL CHECK (action IN ('scanned', 'dispatched', 'delivered', 'returned', 'damaged')),
                location VARCHAR(255),
                scanned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                order_assignment_id INTEGER REFERENCES order_assignments(id) ON DELETE SET NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Bottle Tracking table created/verified');

        // 11. Bottle Deliveries table
        await client.query(`
            CREATE TABLE IF NOT EXISTS bottle_deliveries (
                id SERIAL PRIMARY KEY,
                order_assignment_id INTEGER NOT NULL REFERENCES order_assignments(id) ON DELETE CASCADE,
                bottle_id INTEGER NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
                delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                returned_bottle_id INTEGER REFERENCES bottles(id) ON DELETE SET NULL,
                status VARCHAR(20) DEFAULT 'delivered' CHECK (status IN ('delivered', 'returned', 'pending_return')),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Bottle Deliveries table created/verified');

        // 12. Transactions table - Financial management
        await client.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('income', 'expense')),
                amount DECIMAL(10,2) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'mobile', 'bank', 'cheque')),
                payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'cancelled')),
                transaction_date DATE DEFAULT CURRENT_DATE,
                order_assignment_id INTEGER REFERENCES order_assignments(id) ON DELETE SET NULL,
                customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Transactions table created/verified');

        // 13. Monthly Packages table - Subscription management
        await client.query(`
            CREATE TABLE IF NOT EXISTS monthly_packages (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                package_name VARCHAR(100) NOT NULL,
                bottles_per_month INTEGER NOT NULL,
                bottle_size VARCHAR(10) NOT NULL CHECK (bottle_size IN ('20L', '10L', '5L')),
                monthly_amount DECIMAL(10,2) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
                created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Monthly Packages table created/verified');

        // Create indexes for better performance (with individual error handling)
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_bottles_qr_code ON bottles(qr_code)',
            'CREATE INDEX IF NOT EXISTS idx_bottles_status ON bottles(status)',
            'CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)',
            'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
            'CREATE INDEX IF NOT EXISTS idx_order_assignments_driver_id ON order_assignments(driver_id)',
            'CREATE INDEX IF NOT EXISTS idx_order_assignments_status ON order_assignments(status)',
            'CREATE INDEX IF NOT EXISTS idx_bottle_tracking_bottle_id ON bottle_tracking(bottle_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(payment_status)'
        ];

        for (const indexQuery of indexes) {
            try {
                await client.query(indexQuery);
            } catch (error) {
                console.log(`⚠️  Index creation warning: ${error.message}`);
                // Continue with other indexes even if one fails
            }
        }
        console.log('✅ Database indexes created/verified');

        console.log('🎉 Database migration completed successfully!');
        console.log('📊 All tables and indexes are ready for use.');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { runMigration };