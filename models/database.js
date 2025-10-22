const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'AADataBase',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'admin',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('PostgreSQL connection error:', err);
    process.exit(-1);
});

// Initialize database tables
const initializeDatabase = async () => {
    try {
        // Create users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                fingerprint_data TEXT,
                pin_hash VARCHAR(255),
                is_active BOOLEAN DEFAULT true,
                role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'staff', 'driver', 'user')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        `);

        // Create sessions table for session storage
        await pool.query(`
            CREATE TABLE IF NOT EXISTS session (
                sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
                sess JSON NOT NULL,
                expire TIMESTAMP(6) NOT NULL
            )
            WITH (OIDS=FALSE);
        `);

        // Update users table to add role constraint if it doesn't exist
        try {
            await pool.query(`
                ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
                ALTER TABLE users ADD CONSTRAINT users_role_check 
                CHECK (role IN ('admin', 'staff', 'driver', 'user'));
            `);
        } catch (error) {
            // Constraint might already exist, continue
            console.log('Role constraint update:', error.message);
        }

        // Create login_attempts table for security
        await pool.query(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                ip_address INET,
                attempt_type VARCHAR(50) NOT NULL,
                success BOOLEAN DEFAULT false,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create customers table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                customer_code VARCHAR(10) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                cnic VARCHAR(15) UNIQUE NOT NULL,
                phone_primary VARCHAR(20) NOT NULL,
                phone_secondary VARCHAR(20),
                email VARCHAR(255),
                address_line1 TEXT NOT NULL,
                address_line2 TEXT,
                city VARCHAR(100) NOT NULL,
                area VARCHAR(100),
                postal_code VARCHAR(10),
                landmark TEXT,
                customer_type VARCHAR(20) DEFAULT 'residential' CHECK (customer_type IN ('residential', 'commercial', 'industrial')),
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
                credit_limit DECIMAL(10,2) DEFAULT 0.00,
                current_balance DECIMAL(10,2) DEFAULT 0.00,
                registration_date DATE DEFAULT CURRENT_DATE,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT
            )
        `);

        // Create vehicles table (MOVED UP - must be created before bottles table)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS vehicles (
                id SERIAL PRIMARY KEY,
                license_plate VARCHAR(20) UNIQUE NOT NULL,
                vehicle_type VARCHAR(20) NOT NULL CHECK (vehicle_type IN ('truck', 'van', 'motorcycle', 'car')),
                brand VARCHAR(50),
                model VARCHAR(50),
                year INTEGER,
                capacity INTEGER DEFAULT 0,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
                fuel_type VARCHAR(20) DEFAULT 'petrol' CHECK (fuel_type IN ('petrol', 'diesel', 'electric', 'hybrid')),
                registration_date DATE,
                insurance_expiry DATE,
                last_maintenance DATE,
                notes TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create drivers table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS drivers (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                cnic VARCHAR(15) UNIQUE NOT NULL,
                phone_primary VARCHAR(20) NOT NULL,
                phone_secondary VARCHAR(20),
                email VARCHAR(255),
                license_number VARCHAR(50) UNIQUE NOT NULL,
                license_type VARCHAR(20) NOT NULL CHECK (license_type IN ('motorcycle', 'car', 'truck', 'heavy')),
                license_expiry DATE NOT NULL,
                address TEXT,
                city VARCHAR(100),
                emergency_contact_name VARCHAR(255),
                emergency_contact_phone VARCHAR(20),
                assigned_vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
                hire_date DATE DEFAULT CURRENT_DATE,
                salary DECIMAL(10,2),
                experience_years INTEGER DEFAULT 0,
                notes TEXT,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create bottles table (NOW AFTER vehicles table)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bottles (
                id SERIAL PRIMARY KEY,
                bottle_code VARCHAR(6) UNIQUE NOT NULL,
                bottle_type VARCHAR(10) NOT NULL CHECK (bottle_type IN ('0.5L', '1L', '5L', '20L')),
                qr_code_data TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'AtPlant' CHECK (status IN ('AtPlant', 'AtCustomer', 'AtVehicle')),
                is_refillable BOOLEAN DEFAULT false,
                current_vehicle_id INTEGER REFERENCES vehicles(id),
                description TEXT,
                manufacturing_date DATE DEFAULT CURRENT_DATE,
                expiry_date DATE,
                batch_number VARCHAR(50),
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_status_change TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create orders table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                order_number VARCHAR(15) UNIQUE NOT NULL,
                customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
                order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('subscription', 'on-demand')),
                subscription_type VARCHAR(20) CHECK (subscription_type IN ('monthly', 'parallel-1day', 'parallel-2day', 'parallel-3day', 'custom-dates')),
                custom_delivery_dates TEXT, -- JSON array of selected dates (e.g., [6, 9, 11] for 6th, 9th, 11th of each month)
                bottle_type VARCHAR(10) NOT NULL CHECK (bottle_type IN ('0.5L', '1L', '5L', '20L')),
                quantity_per_delivery INTEGER NOT NULL DEFAULT 1,
                total_bottles_ordered INTEGER,
                bottles_delivered INTEGER DEFAULT 0,
                bottles_remaining INTEGER,
                unit_price DECIMAL(8,2) NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                order_status VARCHAR(20) DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'in-progress', 'completed', 'cancelled', 'paused')),
                payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'overdue')),
                start_date DATE NOT NULL,
                end_date DATE,
                next_delivery_date DATE,
                last_delivery_date DATE,
                delivery_address TEXT,
                delivery_instructions TEXT,
                priority_level VARCHAR(10) DEFAULT 'normal' CHECK (priority_level IN ('low', 'normal', 'high', 'urgent')),
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT
            )
        `);

        // Create order_assignments table for daily order assignments to drivers/vehicles
        await pool.query(`
            CREATE TABLE IF NOT EXISTS order_assignments (
                id SERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
                vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
                assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
                delivery_sequence INTEGER,
                estimated_delivery_time TIME,
                actual_delivery_time TIME,
                delivery_status VARCHAR(20) DEFAULT 'assigned' CHECK (delivery_status IN ('assigned', 'in_progress', 'delivered', 'failed', 'rescheduled')),
                notes TEXT,
                assigned_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(order_id, assigned_date)
            )
        `);

        // Create bottle_history table for status tracking
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bottle_history (
                id SERIAL PRIMARY KEY,
                bottle_id INTEGER REFERENCES bottles(id) ON DELETE CASCADE,
                previous_status VARCHAR(20),
                new_status VARCHAR(20),
                changed_by INTEGER REFERENCES users(id),
                change_reason TEXT,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create bottle_transfers table for plant-vehicle-customer movement tracking
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bottle_transfers (
                id SERIAL PRIMARY KEY,
                bottle_id INTEGER REFERENCES bottles(id) ON DELETE CASCADE,
                from_location VARCHAR(20) NOT NULL CHECK (from_location IN ('Plant', 'Vehicle', 'Customer')),
                to_location VARCHAR(20) NOT NULL CHECK (to_location IN ('Plant', 'Vehicle', 'Customer')),
                from_vehicle_id INTEGER REFERENCES vehicles(id),
                to_vehicle_id INTEGER REFERENCES vehicles(id),
                customer_id INTEGER REFERENCES customers(id),
                order_assignment_id INTEGER REFERENCES order_assignments(id),
                scanned_by INTEGER REFERENCES users(id),
                scan_method VARCHAR(10) DEFAULT 'qr' CHECK (scan_method IN ('qr', 'manual')),
                scan_location VARCHAR(100),
                transfer_reason TEXT,
                transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add indexes for bottle transfers
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_bottle_transfers_bottle_id ON bottle_transfers(bottle_id);
            CREATE INDEX IF NOT EXISTS idx_bottle_transfers_date ON bottle_transfers(transferred_at);
            CREATE INDEX IF NOT EXISTS idx_bottle_transfers_vehicle ON bottle_transfers(from_vehicle_id, to_vehicle_id);
        `);

        // Create deliveries table for tracking each delivery
        await pool.query(`
            CREATE TABLE IF NOT EXISTS deliveries (
                id SERIAL PRIMARY KEY,
                delivery_code VARCHAR(12) UNIQUE NOT NULL,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                customer_id INTEGER REFERENCES customers(id),
                scheduled_date DATE NOT NULL,
                delivered_date DATE,
                bottle_type VARCHAR(10) NOT NULL,
                quantity_scheduled INTEGER NOT NULL,
                quantity_delivered INTEGER DEFAULT 0,
                bottles_assigned TEXT, -- JSON array of bottle IDs
                delivery_status VARCHAR(20) DEFAULT 'scheduled' CHECK (delivery_status IN ('scheduled', 'out-for-delivery', 'delivered', 'failed', 'rescheduled')),
                delivery_person VARCHAR(100),
                delivery_vehicle VARCHAR(50),
                delivery_time TIME,
                customer_signature TEXT,
                delivery_notes TEXT,
                failed_reason TEXT,
                reschedule_date DATE,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create order_history table for tracking changes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS order_history (
                id SERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                action_type VARCHAR(50) NOT NULL,
                previous_status VARCHAR(20),
                new_status VARCHAR(20),
                details TEXT,
                changed_by INTEGER REFERENCES users(id),
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create bottle_history table for status tracking
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bottle_history (
                id SERIAL PRIMARY KEY,
                bottle_id INTEGER REFERENCES bottles(id) ON DELETE CASCADE,
                previous_status VARCHAR(20),
                new_status VARCHAR(20),
                changed_by INTEGER REFERENCES users(id),
                change_reason TEXT,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create bottle_transfers table for plant-vehicle-customer movement tracking
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bottle_transfers (
                id SERIAL PRIMARY KEY,
                bottle_id INTEGER REFERENCES bottles(id) ON DELETE CASCADE,
                from_location VARCHAR(20) NOT NULL CHECK (from_location IN ('Plant', 'Vehicle', 'Customer')),
                to_location VARCHAR(20) NOT NULL CHECK (to_location IN ('Plant', 'Vehicle', 'Customer')),
                from_vehicle_id INTEGER REFERENCES vehicles(id),
                to_vehicle_id INTEGER REFERENCES vehicles(id),
                customer_id INTEGER REFERENCES customers(id),
                order_assignment_id INTEGER REFERENCES order_assignments(id),
                scanned_by INTEGER REFERENCES users(id),
                scan_method VARCHAR(10) DEFAULT 'qr' CHECK (scan_method IN ('qr', 'manual')),
                scan_location VARCHAR(100),
                transfer_reason TEXT,
                transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add indexes for bottle transfers
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_bottle_transfers_bottle_id ON bottle_transfers(bottle_id);
            CREATE INDEX IF NOT EXISTS idx_bottle_transfers_date ON bottle_transfers(transferred_at);
            CREATE INDEX IF NOT EXISTS idx_bottle_transfers_vehicle ON bottle_transfers(from_vehicle_id, to_vehicle_id);
        `);

        // Create order_history table for tracking changes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS order_history (
                id SERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                action_type VARCHAR(50) NOT NULL,
                previous_status VARCHAR(20),
                new_status VARCHAR(20),
                details TEXT,
                changed_by INTEGER REFERENCES users(id),
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create bottle_deliveries table for tracking delivered bottles
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bottle_deliveries (
                id SERIAL PRIMARY KEY,
                order_assignment_id INTEGER REFERENCES order_assignments(id) ON DELETE CASCADE,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                bottle_id INTEGER REFERENCES bottles(id) ON DELETE CASCADE,
                customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
                bottle_code VARCHAR(20) NOT NULL,
                delivery_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                driver_id INTEGER REFERENCES drivers(id),
                vehicle_id INTEGER REFERENCES vehicles(id),
                delivery_notes TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add index for quick bottle code lookups
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_bottle_deliveries_bottle_code 
            ON bottle_deliveries(bottle_code)
        `);

        // Add index for customer bottle tracking
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_bottle_deliveries_customer 
            ON bottle_deliveries(customer_id, delivery_date)
        `);

        // Create default admin user if not exists
        const adminExists = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@dashboard.com']);
        
        if (adminExists.rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const defaultPassword = await bcrypt.hash('admin123', 12);
            const defaultPin = await bcrypt.hash('1234', 12);
            
            await pool.query(`
                INSERT INTO users (email, password_hash, pin_hash, role) 
                VALUES ($1, $2, $3, $4)
            `, ['admin@dashboard.com', defaultPassword, defaultPin, 'admin']);
            
            console.log('Default admin user created: admin@dashboard.com / admin123');
        }

        // Create test staff user if not exists
        const staffExists = await pool.query('SELECT id FROM users WHERE email = $1', ['staff@waterplant.com']);
        
        if (staffExists.rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const defaultPassword = await bcrypt.hash('password123', 12);
            const defaultPin = await bcrypt.hash('1234', 12);
            
            await pool.query(`
                INSERT INTO users (email, password_hash, pin_hash, role) 
                VALUES ($1, $2, $3, $4)
            `, ['staff@waterplant.com', defaultPassword, defaultPin, 'staff']);
            
            console.log('Test staff user created: staff@waterplant.com / password123');
        }

        // Create test driver user if not exists
        const driverExists = await pool.query('SELECT id FROM users WHERE email = $1', ['driver@waterplant.com']);
        
        if (driverExists.rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const defaultPassword = await bcrypt.hash('password123', 12);
            const defaultPin = await bcrypt.hash('1234', 12);
            
            await pool.query(`
                INSERT INTO users (email, password_hash, pin_hash, role) 
                VALUES ($1, $2, $3, $4)
            `, ['driver@waterplant.com', defaultPassword, defaultPin, 'driver']);
            
            console.log('Test driver user created: driver@waterplant.com / password123');
        }

        // Create test regular user if not exists
        const userExists = await pool.query('SELECT id FROM users WHERE email = $1', ['user@waterplant.com']);
        
        if (userExists.rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const defaultPassword = await bcrypt.hash('password123', 12);
            const defaultPin = await bcrypt.hash('1234', 12);
            
            await pool.query(`
                INSERT INTO users (email, password_hash, pin_hash, role) 
                VALUES ($1, $2, $3, $4)
            `, ['user@waterplant.com', defaultPassword, defaultPin, 'user']);
            
            console.log('Test user created: user@waterplant.com / password123');
        }

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
};

module.exports = {
    pool,
    initializeDatabase
};