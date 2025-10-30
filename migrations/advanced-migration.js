const { pool } = require('../models/database');

/**
 * Advanced Database Migration - Updates existing tables and creates missing ones
 * This migration handles both new installations and existing databases
 */

async function runAdvancedMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Starting advanced database migration...');
        
        // Enable UUID extension
        await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        
        // Helper function to check if column exists
        const columnExists = async (tableName, columnName) => {
            const result = await client.query(`
                SELECT COUNT(*) as count 
                FROM information_schema.columns 
                WHERE table_name = $1 AND column_name = $2
            `, [tableName, columnName]);
            return result.rows[0].count > 0;
        };
        
        // Helper function to check if table exists
        const tableExists = async (tableName) => {
            const result = await client.query(`
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_name = $1 AND table_schema = 'public'
            `, [tableName]);
            return result.rows[0].count > 0;
        };

        // 1. Users table - Core authentication
        if (!(await tableExists('users'))) {
            await client.query(`
                CREATE TABLE users (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'staff', 'driver', 'user')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Update existing users table
            if (!(await columnExists('users', 'role'))) {
                await client.query(`ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'staff', 'driver', 'user'))`);
            }
        }
        console.log('✅ Users table created/updated');

        // 2. Session table - For express-session
        if (!(await tableExists('session'))) {
            await client.query(`
                CREATE TABLE session (
                    sid VARCHAR NOT NULL COLLATE "default",
                    sess JSON NOT NULL,
                    expire TIMESTAMP(6) NOT NULL
                )
                WITH (OIDS=FALSE);
                
                ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
                CREATE INDEX IDX_session_expire ON session(expire);
            `);
        }
        console.log('✅ Session table created/updated');

        // 3. Customers table
        if (!(await tableExists('customers'))) {
            await client.query(`
                CREATE TABLE customers (
                    id SERIAL PRIMARY KEY,
                    full_name VARCHAR(255) NOT NULL,
                    phone VARCHAR(20),
                    email VARCHAR(255),
                    address TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }
        console.log('✅ Customers table created/updated');

        // 4. Drivers table
        if (!(await tableExists('drivers'))) {
            await client.query(`
                CREATE TABLE drivers (
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
        }
        console.log('✅ Drivers table created/updated');

        // 5. Staff table
        if (!(await tableExists('staff'))) {
            await client.query(`
                CREATE TABLE staff (
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
        }
        console.log('✅ Staff table created/updated');

        // 6. Vehicles table
        if (!(await tableExists('vehicles'))) {
            await client.query(`
                CREATE TABLE vehicles (
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
        }
        console.log('✅ Vehicles table created/updated');

        // 7. Bottles table - FIX EXISTING STRUCTURE
        if (!(await tableExists('bottles'))) {
            await client.query(`
                CREATE TABLE bottles (
                    id SERIAL PRIMARY KEY,
                    qr_code VARCHAR(255) UNIQUE NOT NULL,
                    size VARCHAR(10) NOT NULL CHECK (size IN ('20L', '10L', '5L')),
                    status VARCHAR(20) DEFAULT 'plant' CHECK (status IN ('plant', 'delivery', 'customer', 'returned', 'damaged')),
                    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Update existing bottles table
            if (!(await columnExists('bottles', 'qr_code'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN qr_code VARCHAR(255) UNIQUE`);
                // Update existing bottles with generated QR codes
                await client.query(`UPDATE bottles SET qr_code = 'QR' || LPAD(id::text, 6, '0') WHERE qr_code IS NULL`);
                await client.query(`ALTER TABLE bottles ALTER COLUMN qr_code SET NOT NULL`);
            }
            if (!(await columnExists('bottles', 'status'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN status VARCHAR(20) DEFAULT 'plant' CHECK (status IN ('plant', 'delivery', 'customer', 'returned', 'damaged'))`);
            }
        }
        console.log('✅ Bottles table created/updated');

        // 8. Orders table
        if (!(await tableExists('orders'))) {
            await client.query(`
                CREATE TABLE orders (
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
        } else {
            // Update existing orders table
            if (!(await columnExists('orders', 'status'))) {
                // Check if order_status exists and migrate it
                const hasOrderStatus = await columnExists('orders', 'order_status');
                if (hasOrderStatus) {
                    await client.query(`ALTER TABLE orders ADD COLUMN status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'assigned', 'in_transit', 'delivered', 'cancelled'))`);
                    // Migrate data from order_status to status
                    await client.query(`UPDATE orders SET status = order_status WHERE status IS NULL`);
                } else {
                    await client.query(`ALTER TABLE orders ADD COLUMN status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'assigned', 'in_transit', 'delivered', 'cancelled'))`);
                }
            }
        }
        console.log('✅ Orders table created/updated');

        // 9. Order Assignments table - FIX EXISTING STRUCTURE
        if (!(await tableExists('order_assignments'))) {
            await client.query(`
                CREATE TABLE order_assignments (
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
        } else {
            // Update existing order_assignments table
            if (!(await columnExists('order_assignments', 'status'))) {
                await client.query(`ALTER TABLE order_assignments ADD COLUMN status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'delivered', 'failed'))`);
                // Migrate existing delivery_status to status
                const hasDeliveryStatus = await columnExists('order_assignments', 'delivery_status');
                if (hasDeliveryStatus) {
                    await client.query(`UPDATE order_assignments SET status = delivery_status WHERE status IS NULL`);
                }
            }
            if (!(await columnExists('order_assignments', 'payment_status'))) {
                await client.query(`ALTER TABLE order_assignments ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed'))`);
                // Migrate existing payment_collected to payment_status
                const hasPaymentCollected = await columnExists('order_assignments', 'payment_collected');
                if (hasPaymentCollected) {
                    await client.query(`UPDATE order_assignments SET payment_status = CASE WHEN payment_collected = TRUE THEN 'completed' ELSE 'pending' END WHERE payment_status IS NULL`);
                }
            }
            if (!(await columnExists('order_assignments', 'delivered_at'))) {
                await client.query(`ALTER TABLE order_assignments ADD COLUMN delivered_at TIMESTAMP`);
                // Migrate existing actual_delivery_time to delivered_at with proper casting
                const hasActualDeliveryTime = await columnExists('order_assignments', 'actual_delivery_time');
                if (hasActualDeliveryTime) {
                    // Check the data type of actual_delivery_time
                    const columnInfo = await client.query(`
                        SELECT data_type 
                        FROM information_schema.columns 
                        WHERE table_name = 'order_assignments' AND column_name = 'actual_delivery_time'
                    `);
                    
                    if (columnInfo.rows.length > 0) {
                        const dataType = columnInfo.rows[0].data_type;
                        if (dataType === 'time without time zone') {
                            // Cast time to timestamp with current date
                            await client.query(`
                                UPDATE order_assignments 
                                SET delivered_at = CURRENT_DATE + actual_delivery_time 
                                WHERE delivered_at IS NULL AND actual_delivery_time IS NOT NULL
                            `);
                        } else {
                            // Direct copy for timestamp types
                            await client.query(`
                                UPDATE order_assignments 
                                SET delivered_at = actual_delivery_time::TIMESTAMP 
                                WHERE delivered_at IS NULL AND actual_delivery_time IS NOT NULL
                            `);
                        }
                    }
                }
            }
            if (!(await columnExists('order_assignments', 'payment_method'))) {
                await client.query(`ALTER TABLE order_assignments ADD COLUMN payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'card', 'mobile', 'bank'))`);
            }
            if (!(await columnExists('order_assignments', 'payment_amount'))) {
                await client.query(`ALTER TABLE order_assignments ADD COLUMN payment_amount DECIMAL(10,2)`);
            }
        }
        console.log('✅ Order Assignments table created/updated');

        // 10. Continue with other tables...
        // Bottle Tracking table
        if (!(await tableExists('bottle_tracking'))) {
            await client.query(`
                CREATE TABLE bottle_tracking (
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
        }
        console.log('✅ Bottle Tracking table created/updated');

        // 11. Bottle Deliveries table
        if (!(await tableExists('bottle_deliveries'))) {
            await client.query(`
                CREATE TABLE bottle_deliveries (
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
        }
        console.log('✅ Bottle Deliveries table created/updated');

        // 12. Transactions table
        if (!(await tableExists('transactions'))) {
            await client.query(`
                CREATE TABLE transactions (
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
        }
        console.log('✅ Transactions table created/updated');

        // 13. Monthly Packages table
        if (!(await tableExists('monthly_packages'))) {
            await client.query(`
                CREATE TABLE monthly_packages (
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
        }
        console.log('✅ Monthly Packages table created/updated');

        // 14. Financial Categories table - for expense categorization
        if (!(await tableExists('financial_categories'))) {
            await client.query(`
                CREATE TABLE financial_categories (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
                    description TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Insert default categories
            await client.query(`
                INSERT INTO financial_categories (name, type, description) VALUES
                ('Water Sales', 'income', 'Revenue from water bottle sales'),
                ('Monthly Packages', 'income', 'Revenue from subscription packages'),
                ('Delivery Charges', 'income', 'Additional delivery charges'),
                ('Vehicle Maintenance', 'expense', 'Vehicle repair and maintenance costs'),
                ('Fuel Costs', 'expense', 'Vehicle fuel expenses'),
                ('Staff Salaries', 'expense', 'Employee salary payments'),
                ('Office Rent', 'expense', 'Office and facility rent'),
                ('Utilities', 'expense', 'Electricity, water, phone bills'),
                ('Marketing', 'expense', 'Advertising and marketing expenses'),
                ('Supplies', 'expense', 'Office supplies and materials')
                ON CONFLICT (name) DO NOTHING
            `);
        }
        console.log('✅ Financial Categories table created/updated');

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
                console.log(`⚠️  Index creation info: ${error.message}`);
            }
        }
        console.log('✅ Database indexes created/verified');

        console.log('🎉 Advanced database migration completed successfully!');
        console.log('📊 All tables updated to new schema and ready for use.');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { runMigration: runAdvancedMigration };