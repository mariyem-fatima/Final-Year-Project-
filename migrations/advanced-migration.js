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
                    password_hash VARCHAR(255) NOT NULL,
                    pin_hash VARCHAR(255),
                    fingerprint_data TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'staff', 'driver', 'user')),
                    last_login TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Update existing users table to add missing columns
            if (!(await columnExists('users', 'role'))) {
                await client.query(`ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'staff', 'driver', 'user'))`);
            }
            if (!(await columnExists('users', 'password_hash')) && (await columnExists('users', 'password'))) {
                // Rename password to password_hash for consistency with User model
                await client.query(`ALTER TABLE users RENAME COLUMN password TO password_hash`);
            } else if (!(await columnExists('users', 'password_hash'))) {
                await client.query(`ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)`);
            }
            if (!(await columnExists('users', 'pin_hash'))) {
                await client.query(`ALTER TABLE users ADD COLUMN pin_hash VARCHAR(255)`);
            }
            if (!(await columnExists('users', 'fingerprint_data'))) {
                await client.query(`ALTER TABLE users ADD COLUMN fingerprint_data TEXT`);
            }
            if (!(await columnExists('users', 'is_active'))) {
                await client.query(`ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE`);
            }
            if (!(await columnExists('users', 'last_login'))) {
                await client.query(`ALTER TABLE users ADD COLUMN last_login TIMESTAMP`);
            }
        }
        console.log('✅ Users table created/updated');

        // 2. Login Attempts table - Security audit log
        if (!(await tableExists('login_attempts'))) {
            await client.query(`
                CREATE TABLE login_attempts (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    ip_address VARCHAR(45),
                    attempt_type VARCHAR(50),
                    success BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }
        console.log('✅ Login Attempts table created/updated');

        // 3. Session table - For express-session
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

        // 4. Customers table
        if (!(await tableExists('customers'))) {
            await client.query(`
                CREATE TABLE customers (
                    id SERIAL PRIMARY KEY,
                    customer_code VARCHAR(50) UNIQUE NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    cnic VARCHAR(20),
                    phone_primary VARCHAR(20),
                    phone_secondary VARCHAR(20),
                    email VARCHAR(255),
                    address_line1 TEXT,
                    address_line2 TEXT,
                    city VARCHAR(100),
                    area VARCHAR(100),
                    postal_code VARCHAR(20),
                    landmark TEXT,
                    customer_type VARCHAR(20) DEFAULT 'residential' CHECK (customer_type IN ('residential', 'commercial', 'industrial')),
                    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
                    credit_limit DECIMAL(10,2) DEFAULT 0.00,
                    current_balance DECIMAL(10,2) DEFAULT 0.00,
                    registration_date DATE DEFAULT CURRENT_DATE,
                    notes TEXT,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Add missing columns to existing table
            if (!(await columnExists('customers', 'customer_code'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN customer_code VARCHAR(50) UNIQUE`);
            }
            if (!(await columnExists('customers', 'cnic'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN cnic VARCHAR(20)`);
            }
            if (!(await columnExists('customers', 'phone_primary'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN phone_primary VARCHAR(20)`);
            }
            if (!(await columnExists('customers', 'phone_secondary'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN phone_secondary VARCHAR(20)`);
            }
            if (!(await columnExists('customers', 'address_line1'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN address_line1 TEXT`);
            }
            if (!(await columnExists('customers', 'address_line2'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN address_line2 TEXT`);
            }
            if (!(await columnExists('customers', 'city'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN city VARCHAR(100)`);
            }
            if (!(await columnExists('customers', 'area'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN area VARCHAR(100)`);
            }
            if (!(await columnExists('customers', 'postal_code'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN postal_code VARCHAR(20)`);
            }
            if (!(await columnExists('customers', 'landmark'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN landmark TEXT`);
            }
            if (!(await columnExists('customers', 'customer_type'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN customer_type VARCHAR(20) DEFAULT 'residential' CHECK (customer_type IN ('residential', 'commercial', 'industrial'))`);
            }
            if (!(await columnExists('customers', 'status'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended'))`);
            }
            if (!(await columnExists('customers', 'credit_limit'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN credit_limit DECIMAL(10,2) DEFAULT 0.00`);
            }
            if (!(await columnExists('customers', 'current_balance'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN current_balance DECIMAL(10,2) DEFAULT 0.00`);
            }
            if (!(await columnExists('customers', 'registration_date'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN registration_date DATE DEFAULT CURRENT_DATE`);
            }
            if (!(await columnExists('customers', 'notes'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN notes TEXT`);
            }
            if (!(await columnExists('customers', 'created_by'))) {
                await client.query(`ALTER TABLE customers ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
            }
        }
        console.log('✅ Customers table created/updated');

        // 5. Drivers table
        if (!(await tableExists('drivers'))) {
            await client.query(`
                CREATE TABLE drivers (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    full_name VARCHAR(255) NOT NULL,
                    cnic VARCHAR(20),
                    phone_primary VARCHAR(20),
                    phone_secondary VARCHAR(20),
                    email VARCHAR(255),
                    license_number VARCHAR(100),
                    license_type VARCHAR(50),
                    license_expiry DATE,
                    address TEXT,
                    city VARCHAR(100),
                    emergency_contact_name VARCHAR(255),
                    emergency_contact_phone VARCHAR(20),
                    assigned_vehicle_id INTEGER,
                    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
                    hire_date DATE,
                    salary DECIMAL(10,2),
                    experience_years INTEGER,
                    notes TEXT,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Add missing columns
            if (!(await columnExists('drivers', 'cnic'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN cnic VARCHAR(20)`);
            }
            if (!(await columnExists('drivers', 'phone_primary'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN phone_primary VARCHAR(20)`);
            }
            if (!(await columnExists('drivers', 'phone_secondary'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN phone_secondary VARCHAR(20)`);
            }
            if (!(await columnExists('drivers', 'license_type'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN license_type VARCHAR(50)`);
            }
            if (!(await columnExists('drivers', 'license_expiry'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN license_expiry DATE`);
            }
            if (!(await columnExists('drivers', 'city'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN city VARCHAR(100)`);
            }
            if (!(await columnExists('drivers', 'emergency_contact_name'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN emergency_contact_name VARCHAR(255)`);
            }
            if (!(await columnExists('drivers', 'emergency_contact_phone'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN emergency_contact_phone VARCHAR(20)`);
            }
            if (!(await columnExists('drivers', 'assigned_vehicle_id'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN assigned_vehicle_id INTEGER`);
            }
            if (!(await columnExists('drivers', 'status'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave'))`);
            }
            if (!(await columnExists('drivers', 'hire_date'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN hire_date DATE`);
            }
            if (!(await columnExists('drivers', 'salary'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN salary DECIMAL(10,2)`);
            }
            if (!(await columnExists('drivers', 'experience_years'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN experience_years INTEGER`);
            }
            if (!(await columnExists('drivers', 'notes'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN notes TEXT`);
            }
            if (!(await columnExists('drivers', 'created_by'))) {
                await client.query(`ALTER TABLE drivers ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
            }
        }
        console.log('✅ Drivers table created/updated');

        // 6. Staff table
        if (!(await tableExists('staff'))) {
            await client.query(`
                CREATE TABLE staff (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    employee_id VARCHAR(50) UNIQUE,
                    full_name VARCHAR(255) NOT NULL,
                    position VARCHAR(100),
                    department VARCHAR(100),
                    phone_primary VARCHAR(20),
                    phone_secondary VARCHAR(20),
                    emergency_contact_name VARCHAR(255),
                    emergency_contact_phone VARCHAR(20),
                    address_line1 TEXT,
                    address_line2 TEXT,
                    city VARCHAR(100),
                    state VARCHAR(100),
                    zip_code VARCHAR(20),
                    hire_date DATE,
                    salary_amount DECIMAL(10,2),
                    salary_type VARCHAR(20) CHECK (salary_type IN ('hourly', 'monthly', 'annual')),
                    bank_account_number VARCHAR(50),
                    bank_name VARCHAR(100),
                    tax_id VARCHAR(50),
                    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
                    notes TEXT,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Add missing columns
            if (!(await columnExists('staff', 'employee_id'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN employee_id VARCHAR(50) UNIQUE`);
            }
            if (!(await columnExists('staff', 'phone_primary'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN phone_primary VARCHAR(20)`);
            }
            if (!(await columnExists('staff', 'phone_secondary'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN phone_secondary VARCHAR(20)`);
            }
            if (!(await columnExists('staff', 'emergency_contact_name'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN emergency_contact_name VARCHAR(255)`);
            }
            if (!(await columnExists('staff', 'emergency_contact_phone'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN emergency_contact_phone VARCHAR(20)`);
            }
            if (!(await columnExists('staff', 'address_line1'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN address_line1 TEXT`);
            }
            if (!(await columnExists('staff', 'address_line2'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN address_line2 TEXT`);
            }
            if (!(await columnExists('staff', 'city'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN city VARCHAR(100)`);
            }
            if (!(await columnExists('staff', 'state'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN state VARCHAR(100)`);
            }
            if (!(await columnExists('staff', 'zip_code'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN zip_code VARCHAR(20)`);
            }
            if (!(await columnExists('staff', 'salary_amount'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN salary_amount DECIMAL(10,2)`);
            }
            if (!(await columnExists('staff', 'salary_type'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN salary_type VARCHAR(20) CHECK (salary_type IN ('hourly', 'monthly', 'annual'))`);
            }
            if (!(await columnExists('staff', 'bank_account_number'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN bank_account_number VARCHAR(50)`);
            }
            if (!(await columnExists('staff', 'bank_name'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN bank_name VARCHAR(100)`);
            }
            if (!(await columnExists('staff', 'tax_id'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN tax_id VARCHAR(50)`);
            }
            if (!(await columnExists('staff', 'notes'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN notes TEXT`);
            }
            if (!(await columnExists('staff', 'created_by'))) {
                await client.query(`ALTER TABLE staff ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
            }
            // Rename old columns if they exist
            if (await columnExists('staff', 'phone') && !(await columnExists('staff', 'phone_primary'))) {
                await client.query(`ALTER TABLE staff RENAME COLUMN phone TO phone_primary`);
            }
            if (await columnExists('staff', 'email')) {
                try {
                    await client.query(`ALTER TABLE staff DROP COLUMN email`);
                } catch (e) {
                    console.log('Note: Could not drop email column from staff');
                }
            }
        }
        console.log('✅ Staff table created/updated');

        // 7. Vehicles table
        if (!(await tableExists('vehicles'))) {
            await client.query(`
                CREATE TABLE vehicles (
                    id SERIAL PRIMARY KEY,
                    license_plate VARCHAR(20) UNIQUE NOT NULL,
                    vehicle_type VARCHAR(50) DEFAULT 'truck' CHECK (vehicle_type IN ('truck', 'van', 'motorcycle', 'car')),
                    brand VARCHAR(100),
                    model VARCHAR(100),
                    year INTEGER,
                    capacity INTEGER DEFAULT 0,
                    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
                    fuel_type VARCHAR(20) DEFAULT 'petrol' CHECK (fuel_type IN ('petrol', 'diesel', 'electric', 'hybrid')),
                    registration_date DATE,
                    insurance_expiry DATE,
                    last_maintenance DATE,
                    notes TEXT,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Add missing columns
            if (!(await columnExists('vehicles', 'vehicle_type'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN vehicle_type VARCHAR(50) DEFAULT 'truck' CHECK (vehicle_type IN ('truck', 'van', 'motorcycle', 'car'))`);
            }
            if (!(await columnExists('vehicles', 'brand'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN brand VARCHAR(100)`);
            }
            if (!(await columnExists('vehicles', 'model'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN model VARCHAR(100)`);
            }
            if (!(await columnExists('vehicles', 'year'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN year INTEGER`);
            }
            if (!(await columnExists('vehicles', 'capacity'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN capacity INTEGER DEFAULT 0`);
            }
            if (!(await columnExists('vehicles', 'status'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive'))`);
            }
            if (!(await columnExists('vehicles', 'fuel_type'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN fuel_type VARCHAR(20) DEFAULT 'petrol' CHECK (fuel_type IN ('petrol', 'diesel', 'electric', 'hybrid'))`);
            }
            if (!(await columnExists('vehicles', 'registration_date'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN registration_date DATE`);
            }
            if (!(await columnExists('vehicles', 'insurance_expiry'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN insurance_expiry DATE`);
            }
            if (!(await columnExists('vehicles', 'last_maintenance'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN last_maintenance DATE`);
            }
            if (!(await columnExists('vehicles', 'notes'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN notes TEXT`);
            }
            if (!(await columnExists('vehicles', 'created_by'))) {
                await client.query(`ALTER TABLE vehicles ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
            }
            // Remove old driver_id column if exists
            if (await columnExists('vehicles', 'driver_id')) {
                try {
                    await client.query(`ALTER TABLE vehicles DROP COLUMN driver_id`);
                } catch (e) {
                    console.log('Note: Could not drop driver_id column from vehicles');
                }
            }
        }
        console.log('✅ Vehicles table created/updated');

        // 8. Bottles table - Complete structure
        if (!(await tableExists('bottles'))) {
            await client.query(`
                CREATE TABLE bottles (
                    id SERIAL PRIMARY KEY,
                    bottle_code VARCHAR(50) UNIQUE NOT NULL,
                    bottle_type VARCHAR(10) NOT NULL CHECK (bottle_type IN ('20L', '10L', '5L', '1L', '500ML')),
                    qr_code_data TEXT,
                    status VARCHAR(20) DEFAULT 'AtPlant' CHECK (status IN ('AtPlant', 'AtVehicle', 'AtCustomer', 'Damaged', 'Lost')),
                    is_refillable BOOLEAN DEFAULT TRUE,
                    current_vehicle_id INTEGER,
                    description TEXT,
                    manufacturing_date DATE,
                    expiry_date DATE,
                    batch_number VARCHAR(50),
                    last_status_change TIMESTAMP,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Update existing bottles table with all required columns
            if (!(await columnExists('bottles', 'bottle_code'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN bottle_code VARCHAR(50) UNIQUE`);
            }
            if (!(await columnExists('bottles', 'bottle_type'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN bottle_type VARCHAR(10) CHECK (bottle_type IN ('20L', '10L', '5L', '1L', '500ML'))`);
            }
            if (!(await columnExists('bottles', 'qr_code_data'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN qr_code_data TEXT`);
            }
            if (!(await columnExists('bottles', 'status'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN status VARCHAR(20) DEFAULT 'AtPlant' CHECK (status IN ('AtPlant', 'AtVehicle', 'AtCustomer', 'Damaged', 'Lost'))`);
            }
            if (!(await columnExists('bottles', 'is_refillable'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN is_refillable BOOLEAN DEFAULT TRUE`);
            }
            if (!(await columnExists('bottles', 'current_vehicle_id'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN current_vehicle_id INTEGER`);
            }
            if (!(await columnExists('bottles','description'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN description TEXT`);
            }
            if (!(await columnExists('bottles', 'manufacturing_date'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN manufacturing_date DATE`);
            }
            if (!(await columnExists('bottles', 'expiry_date'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN expiry_date DATE`);
            }
            if (!(await columnExists('bottles', 'batch_number'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN batch_number VARCHAR(50)`);
            }
            if (!(await columnExists('bottles', 'last_status_change'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN last_status_change TIMESTAMP`);
            }
            if (!(await columnExists('bottles', 'created_by'))) {
                await client.query(`ALTER TABLE bottles ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
            }
            // Drop old columns if they don't match new schema
            if (await columnExists('bottles', 'qr_code') && !(await columnExists('bottles', 'bottle_code'))) {
                try {
                    await client.query(`ALTER TABLE bottles RENAME COLUMN qr_code TO bottle_code`);
                } catch (e) {
                    console.log('Note: Could not rename qr_code to bottle_code');
                }
            }
            if (await columnExists('bottles', 'size') && !(await columnExists('bottles', 'bottle_type'))) {
                try {
                    await client.query(`ALTER TABLE bottles RENAME COLUMN size TO bottle_type`);
                } catch (e) {
                    console.log('Note: Could not rename size to bottle_type');
                }
            }
        }
        console.log('✅ Bottles table created/updated');

        // 9. Orders table - Complete structure
        if (!(await tableExists('orders'))) {
            await client.query(`
                CREATE TABLE orders (
                    id SERIAL PRIMARY KEY,
                    order_number VARCHAR(50) UNIQUE NOT NULL,
                    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                    order_type VARCHAR(20) DEFAULT 'one-time' CHECK (order_type IN ('one-time', 'subscription')),
                    subscription_type VARCHAR(20) CHECK (subscription_type IN ('daily', 'weekly', 'bi-weekly', 'monthly', 'custom')),
                    custom_delivery_dates TEXT,
                    bottle_type VARCHAR(10) NOT NULL CHECK (bottle_type IN ('20L', '10L', '5L', '1L', '500ML')),
                    quantity_per_delivery INTEGER NOT NULL DEFAULT 1,
                    total_bottles_ordered INTEGER NOT NULL DEFAULT 1,
                    bottles_delivered INTEGER DEFAULT 0,
                    bottles_remaining INTEGER,
                    unit_price DECIMAL(10,2) NOT NULL,
                    total_amount DECIMAL(10,2) NOT NULL,
                    order_status VARCHAR(20) DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
                    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded')),
                    start_date DATE,
                    end_date DATE,
                    next_delivery_date DATE,
                    last_delivery_date DATE,
                    delivery_address TEXT,
                    delivery_instructions TEXT,
                    priority_level VARCHAR(20) DEFAULT 'normal' CHECK (priority_level IN ('low', 'normal', 'high', 'urgent')),
                    notes TEXT,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Add all missing columns for existing table
            const columnsToAdd = [
                { name: 'order_type', def: `VARCHAR(20) DEFAULT 'one-time' CHECK (order_type IN ('one-time', 'subscription'))` },
                { name: 'subscription_type', def: `VARCHAR(20) CHECK (subscription_type IN ('daily', 'weekly', 'bi-weekly', 'monthly', 'custom'))` },
                { name: 'custom_delivery_dates', def: 'TEXT' },
                { name: 'bottle_type', def: `VARCHAR(10) CHECK (bottle_type IN ('20L', '10L', '5L', '1L', '500ML'))` },
                { name: 'quantity_per_delivery', def: 'INTEGER DEFAULT 1' },
                { name: 'total_bottles_ordered', def: 'INTEGER DEFAULT 1' },
                { name: 'bottles_delivered', def: 'INTEGER DEFAULT 0' },
                { name: 'bottles_remaining', def: 'INTEGER' },
                { name: 'unit_price', def: 'DECIMAL(10,2)' },
                { name: 'total_amount', def: 'DECIMAL(10,2)' },
                { name: 'order_status', def: `VARCHAR(20) DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled'))` },
                { name: 'payment_status', def: `VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded'))` },
                { name: 'start_date', def: 'DATE' },
                { name: 'end_date', def: 'DATE' },
                { name: 'next_delivery_date', def: 'DATE' },
                { name: 'last_delivery_date', def: 'DATE' },
                { name: 'delivery_address', def: 'TEXT' },
                { name: 'delivery_instructions', def: 'TEXT' },
                { name: 'priority_level', def: `VARCHAR(20) DEFAULT 'normal' CHECK (priority_level IN ('low', 'normal', 'high', 'urgent'))` },
                { name: 'notes', def: 'TEXT' },
                { name: 'created_by', def: 'INTEGER REFERENCES users(id) ON DELETE SET NULL' }
            ];

            for (const col of columnsToAdd) {
                if (!(await columnExists('orders', col.name))) {
                    try {
                        await client.query(`ALTER TABLE orders ADD COLUMN ${col.name} ${col.def}`);
                    } catch (e) {
                        console.log(`Note: Could not add ${col.name} to orders:`, e.message);
                    }
                }
            }

            // Rename old columns if they exist
            if (await columnExists('orders', 'bottle_size') && !(await columnExists('orders', 'bottle_type'))) {
                try {
                    await client.query(`ALTER TABLE orders RENAME COLUMN bottle_size TO bottle_type`);
                } catch (e) {
                    console.log('Note: Could not rename bottle_size to bottle_type');
                }
            }
            if (await columnExists('orders', 'quantity') && !(await columnExists('orders', 'quantity_per_delivery'))) {
                try {
                    await client.query(`ALTER TABLE orders RENAME COLUMN quantity TO quantity_per_delivery`);
                } catch (e) {
                    console.log('Note: Could not rename quantity to quantity_per_delivery');
                }
            }
            if (await columnExists('orders', 'status') && !(await columnExists('orders', 'order_status'))) {
                try {
                    await client.query(`ALTER TABLE orders RENAME COLUMN status TO order_status`);
                } catch (e) {
                    console.log('Note: Could not rename status to order_status');
                }
            }
        }
        console.log('✅ Orders table created/updated');

        // 10. Order Assignments table - Complete structure
        if (!(await tableExists('order_assignments'))) {
            await client.query(`
                CREATE TABLE order_assignments (
                    id SERIAL PRIMARY KEY,
                    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                    driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
                    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
                    assigned_date DATE DEFAULT CURRENT_DATE,
                    delivery_sequence INTEGER,
                    estimated_delivery_time TIMESTAMP,
                    actual_delivery_time TIMESTAMP,
                    delivery_status VARCHAR(20) DEFAULT 'assigned' CHECK (delivery_status IN ('assigned', 'in_progress', 'delivered', 'failed', 'cancelled')),
                    notes TEXT,
                    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Add missing columns
            if (!(await columnExists('order_assignments', 'delivery_sequence'))) {
                await client.query(`ALTER TABLE order_assignments ADD COLUMN delivery_sequence INTEGER`);
            }
            if (!(await columnExists('order_assignments', 'estimated_delivery_time'))) {
                await client.query(`ALTER TABLE order_assignments ADD COLUMN estimated_delivery_time TIMESTAMP`);
            }
            if (!(await columnExists('order_assignments', 'actual_delivery_time'))) {
                await client.query(`ALTER TABLE order_assignments ADD COLUMN actual_delivery_time TIMESTAMP`);
            }
            if (!(await columnExists('order_assignments', 'delivery_status'))) {
                await client.query(`ALTER TABLE order_assignments ADD COLUMN delivery_status VARCHAR(20) DEFAULT 'assigned' CHECK (delivery_status IN ('assigned', 'in_progress', 'delivered', 'failed', 'cancelled'))`);
            }
            if (!(await columnExists('order_assignments', 'assigned_by'))) {
                await client.query(`ALTER TABLE order_assignments ADD COLUMN assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
            }
        }
        console.log('✅ Order Assignments table created/updated');

        // 11. Bottle Tracking table - Complete structure
        if (!(await tableExists('bottle_tracking'))) {
            await client.query(`
                CREATE TABLE bottle_tracking (
                    id SERIAL PRIMARY KEY,
                    bottle_id INTEGER NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
                    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
                    assignment_id INTEGER REFERENCES order_assignments(id) ON DELETE SET NULL,
                    current_status VARCHAR(50),
                    current_location TEXT,
                    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
                    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                    driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Add missing columns
            if (!(await columnExists('bottle_tracking', 'order_id'))) {
                await client.query(`ALTER TABLE bottle_tracking ADD COLUMN order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL`);
            }
            if (!(await columnExists('bottle_tracking', 'assignment_id')) && (await columnExists('bottle_tracking', 'order_assignment_id'))) {
                try {
                    await client.query(`ALTER TABLE bottle_tracking RENAME COLUMN order_assignment_id TO assignment_id`);
                } catch (e) {
                    console.log('Note: Could not rename order_assignment_id');
                }
            } else if (!(await columnExists('bottle_tracking', 'assignment_id'))) {
                await client.query(`ALTER TABLE bottle_tracking ADD COLUMN assignment_id INTEGER REFERENCES order_assignments(id) ON DELETE SET NULL`);
            }
            if (!(await columnExists('bottle_tracking', 'current_status'))) {
                await client.query(`ALTER TABLE bottle_tracking ADD COLUMN current_status VARCHAR(50)`);
            }
            if (!(await columnExists('bottle_tracking', 'current_location')) && (await columnExists('bottle_tracking', 'location'))) {
                try {
                    await client.query(`ALTER TABLE bottle_tracking RENAME COLUMN location TO current_location`);
                } catch (e) {
                    console.log('Note: Could not rename location');
                }
            } else if (!(await columnExists('bottle_tracking', 'current_location'))) {
                await client.query(`ALTER TABLE bottle_tracking ADD COLUMN current_location TEXT`);
            }
            if (!(await columnExists('bottle_tracking', 'vehicle_id'))) {
                await client.query(`ALTER TABLE bottle_tracking ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL`);
            }
            if (!(await columnExists('bottle_tracking', 'customer_id'))) {
                await client.query(`ALTER TABLE bottle_tracking ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL`);
            }
            if (!(await columnExists('bottle_tracking', 'driver_id'))) {
                await client.query(`ALTER TABLE bottle_tracking ADD COLUMN driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL`);
            }
        }
        console.log('✅ Bottle Tracking table created/updated');

        // 12. Bottle Deliveries table - Complete structure
        if (!(await tableExists('bottle_deliveries'))) {
            await client.query(`
                CREATE TABLE bottle_deliveries (
                    id SERIAL PRIMARY KEY,
                    order_assignment_id INTEGER NOT NULL REFERENCES order_assignments(id) ON DELETE CASCADE,
                    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
                    bottle_id INTEGER NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
                    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                    bottle_code VARCHAR(50),
                    delivery_date DATE,
                    driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
                    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
                    delivery_notes TEXT,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } else {
            // Add missing columns
            if (!(await columnExists('bottle_deliveries', 'order_id'))) {
                await client.query(`ALTER TABLE bottle_deliveries ADD COLUMN order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL`);
            }
            if (!(await columnExists('bottle_deliveries', 'customer_id'))) {
                await client.query(`ALTER TABLE bottle_deliveries ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL`);
            }
            if (!(await columnExists('bottle_deliveries', 'bottle_code'))) {
                await client.query(`ALTER TABLE bottle_deliveries ADD COLUMN bottle_code VARCHAR(50)`);
            }
            if (!(await columnExists('bottle_deliveries', 'delivery_date'))) {
                await client.query(`ALTER TABLE bottle_deliveries ADD COLUMN delivery_date DATE`);
            }
            if (!(await columnExists('bottle_deliveries', 'driver_id'))) {
                await client.query(`ALTER TABLE bottle_deliveries ADD COLUMN driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL`);
            }
            if (!(await columnExists('bottle_deliveries', 'vehicle_id'))) {
                await client.query(`ALTER TABLE bottle_deliveries ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL`);
            }
            if (!(await columnExists('bottle_deliveries', 'delivery_notes')) && (await columnExists('bottle_deliveries', 'notes'))) {
                try {
                    await client.query(`ALTER TABLE bottle_deliveries RENAME COLUMN notes TO delivery_notes`);
                } catch (e) {
                    console.log('Note: Could not rename notes to delivery_notes');
                }
            } else if (!(await columnExists('bottle_deliveries', 'delivery_notes'))) {
                await client.query(`ALTER TABLE bottle_deliveries ADD COLUMN delivery_notes TEXT`);
            }
            if (!(await columnExists('bottle_deliveries', 'created_by'))) {
                await client.query(`ALTER TABLE bottle_deliveries ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
            }
        }
        console.log('✅ Bottle Deliveries table created/updated');

        // 13. Transactions table
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

        // 14. Monthly Packages table - Subscription management
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

        // 15. Financial Categories table - for expense categorization
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
            'CREATE INDEX IF NOT EXISTS idx_bottles_bottle_code ON bottles(bottle_code)',
            'CREATE INDEX IF NOT EXISTS idx_bottles_bottle_type ON bottles(bottle_type)',
            'CREATE INDEX IF NOT EXISTS idx_bottles_status ON bottles(status)',
            'CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)',
            'CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status)',
            'CREATE INDEX IF NOT EXISTS idx_order_assignments_driver_id ON order_assignments(driver_id)',
            'CREATE INDEX IF NOT EXISTS idx_order_assignments_delivery_status ON order_assignments(delivery_status)',
            'CREATE INDEX IF NOT EXISTS idx_bottle_tracking_bottle_id ON bottle_tracking(bottle_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(payment_status)',
            'CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code)',
            'CREATE INDEX IF NOT EXISTS idx_drivers_cnic ON drivers(cnic)',
            'CREATE INDEX IF NOT EXISTS idx_vehicles_license_plate ON vehicles(license_plate)'
        ];

        for (const indexQuery of indexes) {
            try {
                await client.query(indexQuery);
            } catch (error) {
                console.log(`⚠️  Index creation info: ${error.message}`);
            }
        }
        console.log('✅ Database indexes created/verified');

        // Seed default admin user if no users exist
        await seedDefaultUser(client);

        console.log('🎉 Advanced database migration completed successfully!');
        console.log('📊 All tables updated to new schema and ready for use.');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Seed default admin user if database is empty
 */
async function seedDefaultUser(client) {
    try {
        // Check if any users exist
        const result = await client.query('SELECT COUNT(*) as count FROM users');
        const userCount = parseInt(result.rows[0].count);

        if (userCount === 0) {
            // No users exist, create default admin as per README specifications
            const bcrypt = require('bcryptjs');
            const defaultPassword = 'admin123';
            const defaultPin = '1234';
            const hashedPassword = await bcrypt.hash(defaultPassword, 12);
            const hashedPin = await bcrypt.hash(defaultPin, 12);

            await client.query(`
                INSERT INTO users (email, password_hash, pin_hash, role)
                VALUES ($1, $2, $3, $4)
            `, ['admin@dashboard.com', hashedPassword, hashedPin, 'admin']);

            console.log('✅ Default admin user created');
            console.log('📧 Email: admin@dashboard.com');
            console.log('🔑 Password: admin123');
            console.log('📌 PIN: 1234');
            console.log('⚠️  IMPORTANT: Please change the default credentials after first login!');
        } else {
            console.log('ℹ️  Users already exist in database, skipping seed data');
        }
    } catch (error) {
        console.error('⚠️  Warning: Could not seed default user:', error.message);
        // Don't throw - this shouldn't break the migration
    }
}

module.exports = { runMigration: runAdvancedMigration };