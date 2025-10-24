const { pool } = require('./models/database');

async function createFinancialManagementSystem() {
    try {
        console.log('💰 Creating Financial Management System...\n');

        // 1. Transactions table - main financial records
        console.log('📊 Creating transactions table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                transaction_type VARCHAR(50) NOT NULL, -- 'income', 'expense', 'salary', 'purchase'
                category VARCHAR(100) NOT NULL, -- 'order_payment', 'monthly_package', 'bottle_purchase', 'staff_salary', 'driver_salary', 'operational'
                amount DECIMAL(10,2) NOT NULL,
                description TEXT,
                reference_type VARCHAR(50), -- 'order', 'assignment', 'employee', 'supplier'
                reference_id INTEGER, -- ID of the related record
                customer_id INTEGER REFERENCES customers(id),
                employee_id INTEGER REFERENCES users(id), -- for salaries
                payment_method VARCHAR(50), -- 'cash', 'card', 'bank_transfer', 'check'
                payment_status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'cancelled'
                transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
                due_date DATE, -- for pending payments
                notes TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Monthly packages table
        console.log('📦 Creating monthly packages table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS monthly_packages (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers(id),
                package_name VARCHAR(100) NOT NULL,
                monthly_amount DECIMAL(10,2) NOT NULL,
                bottles_per_month INTEGER NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE,
                payment_day INTEGER DEFAULT 1, -- day of month for payment
                status VARCHAR(30) DEFAULT 'active', -- 'active', 'suspended', 'cancelled'
                last_payment_date DATE,
                next_payment_due DATE,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Employee payroll table
        console.log('👥 Creating employee payroll table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS employee_payroll (
                id SERIAL PRIMARY KEY,
                employee_id INTEGER NOT NULL REFERENCES users(id),
                employee_type VARCHAR(30) NOT NULL, -- 'driver', 'staff', 'admin'
                salary_type VARCHAR(30) NOT NULL, -- 'monthly', 'weekly', 'per_delivery', 'hourly'
                base_amount DECIMAL(10,2) NOT NULL,
                commission_rate DECIMAL(5,2) DEFAULT 0, -- percentage for delivery commission
                payment_schedule VARCHAR(30) DEFAULT 'monthly', -- 'weekly', 'monthly', 'bi_weekly'
                last_payment_date DATE,
                next_payment_due DATE,
                total_paid_this_month DECIMAL(10,2) DEFAULT 0,
                status VARCHAR(30) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4. Inventory purchases table
        console.log('📦 Creating inventory purchases table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventory_purchases (
                id SERIAL PRIMARY KEY,
                supplier_name VARCHAR(200) NOT NULL,
                supplier_contact VARCHAR(100),
                item_type VARCHAR(100) NOT NULL, -- 'bottles', 'caps', 'labels', 'vehicles', 'equipment'
                item_description TEXT,
                quantity INTEGER NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
                payment_status VARCHAR(30) DEFAULT 'pending',
                payment_due_date DATE,
                invoice_number VARCHAR(100),
                notes TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 5. Add payment tracking to existing orders
        console.log('💳 Adding payment tracking to orders...');
        await pool.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'pending',
            ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
            ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP,
            ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2),
            ADD COLUMN IF NOT EXISTS payment_notes TEXT
        `);

        // 6. Add payment tracking to order assignments
        await pool.query(`
            ALTER TABLE order_assignments 
            ADD COLUMN IF NOT EXISTS payment_collected BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS payment_collected_by INTEGER REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS payment_collected_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS collection_notes TEXT
        `);

        // 7. Create indexes for better performance
        console.log('🔍 Creating database indexes...');
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
            CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
            CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(payment_status);
            CREATE INDEX IF NOT EXISTS idx_monthly_packages_customer ON monthly_packages(customer_id);
            CREATE INDEX IF NOT EXISTS idx_monthly_packages_due_date ON monthly_packages(next_payment_due);
            CREATE INDEX IF NOT EXISTS idx_payroll_employee ON employee_payroll(employee_id);
            CREATE INDEX IF NOT EXISTS idx_inventory_purchases_date ON inventory_purchases(purchase_date);
        `);

        // 8. Insert sample financial categories
        console.log('📝 Setting up financial categories...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS financial_categories (
                id SERIAL PRIMARY KEY,
                category_name VARCHAR(100) NOT NULL UNIQUE,
                category_type VARCHAR(50) NOT NULL, -- 'income', 'expense'
                description TEXT,
                is_active BOOLEAN DEFAULT TRUE
            )
        `);

        // Insert default categories
        const categories = [
            ['Order Payment', 'income', 'Payment received for delivered orders'],
            ['Monthly Package', 'income', 'Monthly subscription package payments'],
            ['Staff Salary', 'expense', 'Monthly salary payments to staff'],
            ['Driver Salary', 'expense', 'Salary and commission payments to drivers'],
            ['Bottle Purchase', 'expense', 'Cost of purchasing new bottles'],
            ['Vehicle Maintenance', 'expense', 'Vehicle repair and maintenance costs'],
            ['Fuel Expenses', 'expense', 'Fuel costs for delivery vehicles'],
            ['Operational Costs', 'expense', 'General operational expenses'],
            ['Equipment Purchase', 'expense', 'Purchase of equipment and machinery']
        ];

        for (const [name, type, description] of categories) {
            await pool.query(`
                INSERT INTO financial_categories (category_name, category_type, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (category_name) DO NOTHING
            `, [name, type, description]);
        }

        console.log('✅ Financial Management System created successfully!\n');

        // Show summary
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('transactions', 'monthly_packages', 'employee_payroll', 'inventory_purchases', 'financial_categories')
            ORDER BY table_name
        `);

        console.log('📋 Created Financial Tables:');
        console.table(tablesResult.rows);

        console.log('\n🌟 FINANCIAL SYSTEM FEATURES:');
        console.log('✅ Order payment tracking');
        console.log('✅ Monthly package billing');
        console.log('✅ Employee payroll management');
        console.log('✅ Inventory purchase tracking');
        console.log('✅ Expense categorization');
        console.log('✅ Revenue and expense analysis');
        console.log('✅ Payment collection workflow');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error creating financial system:', error.message);
        process.exit(1);
    }
}

createFinancialManagementSystem();