const { pool } = require('./models/database');

async function addStaffTableAndModel() {
    try {
        console.log('👥 Adding Staff Management System...\n');

        // 1. Create staff table similar to drivers table
        console.log('📋 Creating staff table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS staff (
                id SERIAL PRIMARY KEY,
                user_id INTEGER UNIQUE REFERENCES users(id), -- Link to authentication user
                employee_id VARCHAR(20) UNIQUE, -- Employee ID like EMP001
                full_name VARCHAR(200) NOT NULL,
                position VARCHAR(100), -- 'Manager', 'Cashier', 'Administrator', 'Supervisor'
                department VARCHAR(100), -- 'Operations', 'Finance', 'Customer Service', 'Administration'
                phone_primary VARCHAR(20),
                phone_secondary VARCHAR(20),
                emergency_contact_name VARCHAR(200),
                emergency_contact_phone VARCHAR(20),
                address_line1 VARCHAR(255),
                address_line2 VARCHAR(255),
                city VARCHAR(100),
                state VARCHAR(100),
                zip_code VARCHAR(20),
                hire_date DATE,
                salary_amount DECIMAL(10,2),
                salary_type VARCHAR(30) DEFAULT 'monthly', -- 'monthly', 'weekly', 'hourly'
                bank_account_number VARCHAR(50),
                bank_name VARCHAR(100),
                tax_id VARCHAR(50), -- SSN or Tax ID
                status VARCHAR(20) DEFAULT 'active', -- 'active', 'inactive', 'terminated'
                notes TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Update employee_payroll to include staff
        console.log('💰 Updating payroll system for staff...');
        await pool.query(`
            ALTER TABLE employee_payroll 
            ADD COLUMN IF NOT EXISTS staff_id INTEGER REFERENCES staff(id)
        `);

        // 3. Create staff permissions table
        console.log('🔐 Creating staff permissions table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS staff_permissions (
                id SERIAL PRIMARY KEY,
                staff_id INTEGER NOT NULL REFERENCES staff(id),
                permission_name VARCHAR(100) NOT NULL, -- 'manage_orders', 'collect_payments', 'view_reports', 'manage_customers'
                granted_by INTEGER REFERENCES users(id),
                granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4. Add indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
            CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON staff(employee_id);
            CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status);
            CREATE INDEX IF NOT EXISTS idx_staff_permissions_staff ON staff_permissions(staff_id);
        `);

        // 5. Insert sample staff positions and permissions
        console.log('📝 Setting up staff roles and permissions...');
        
        const staffRoles = [
            ['Manager', 'Operations', 'Complete system access and team management'],
            ['Cashier', 'Finance', 'Payment collection and basic customer service'],
            ['Administrator', 'Administration', 'System administration and user management'],
            ['Supervisor', 'Operations', 'Supervise daily operations and staff'],
            ['Customer Service', 'Customer Service', 'Handle customer inquiries and support']
        ];

        await pool.query(`
            CREATE TABLE IF NOT EXISTS staff_role_templates (
                id SERIAL PRIMARY KEY,
                role_name VARCHAR(100) NOT NULL UNIQUE,
                department VARCHAR(100),
                description TEXT,
                default_permissions TEXT[], -- Array of default permission names
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        for (const [role, dept, desc] of staffRoles) {
            let permissions = [];
            switch(role) {
                case 'Manager':
                    permissions = ['manage_orders', 'collect_payments', 'view_reports', 'manage_customers', 'manage_staff', 'manage_inventory'];
                    break;
                case 'Cashier':
                    permissions = ['collect_payments', 'view_orders', 'manage_customers'];
                    break;
                case 'Administrator':
                    permissions = ['manage_users', 'view_reports', 'system_settings'];
                    break;
                case 'Supervisor':
                    permissions = ['manage_orders', 'view_reports', 'manage_staff'];
                    break;
                case 'Customer Service':
                    permissions = ['manage_customers', 'view_orders', 'handle_complaints'];
                    break;
            }

            await pool.query(`
                INSERT INTO staff_role_templates (role_name, department, description, default_permissions)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (role_name) DO UPDATE SET
                    department = $2,
                    description = $3,
                    default_permissions = $4
            `, [role, dept, desc, permissions]);
        }

        console.log('✅ Staff Management System created successfully!\n');

        // Show summary
        const staffTablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('staff', 'staff_permissions', 'staff_role_templates')
            ORDER BY table_name
        `);

        console.log('📋 Created Staff Tables:');
        console.table(staffTablesResult.rows);

        console.log('\n🌟 STAFF MANAGEMENT FEATURES:');
        console.log('✅ Staff profile management (similar to drivers)');
        console.log('✅ User-to-staff linking via user_id');
        console.log('✅ Position and department tracking');
        console.log('✅ Salary and payroll integration');
        console.log('✅ Role-based permissions system');
        console.log('✅ Emergency contact information');
        console.log('✅ Bank details for salary payments');

        console.log('\n📝 NEXT STEPS:');
        console.log('1. Create Staff model (similar to Driver model)');
        console.log('2. Add staff routes for CRUD operations');
        console.log('3. Link existing users to staff profiles');
        console.log('4. Integrate with financial/payroll system');

        process.exit(0);

    } catch (error) {
        console.error('❌ Error creating staff system:', error.message);
        process.exit(1);
    }
}

addStaffTableAndModel();