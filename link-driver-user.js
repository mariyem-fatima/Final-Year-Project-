// Script to link existing driver user to a driver profile
const { pool } = require('./models/database');
const Driver = require('./models/Driver');

async function linkDriverUser() {
    try {
        console.log('Linking driver user to driver profile...');

        // Find the driver user
        const userResult = await pool.query('SELECT * FROM users WHERE role = \'driver\' AND email = \'driver@waterplant.com\'');
        
        if (userResult.rows.length === 0) {
            console.log('❌ Driver user not found');
            process.exit(1);
        }

        const driverUser = userResult.rows[0];
        console.log('✅ Found driver user:', driverUser.email);

        // Check if driver profile already exists for this user
        const existingDriver = await Driver.findByUserId(driverUser.id);
        if (existingDriver) {
            console.log('✅ Driver profile already exists for this user');
            console.log('Driver ID:', existingDriver.id);
            console.log('Driver Name:', existingDriver.full_name);
            process.exit(0);
        }

        // Create driver profile linked to the user
        const driverData = {
            user_id: driverUser.id,
            full_name: 'Test Driver',
            cnic: '12345-6789012-3',
            phone_primary: '+92-300-1234567',
            phone_secondary: null,
            email: driverUser.email,
            license_number: 'LIC123456',
            license_type: 'car',
            license_expiry: '2025-12-31',
            address: '123 Driver Street, Karachi',
            city: 'Karachi',
            emergency_contact_name: 'Emergency Contact',
            emergency_contact_phone: '+92-300-7654321',
            assigned_vehicle_id: null,
            status: 'active',
            hire_date: new Date().toISOString().split('T')[0],
            salary: 50000,
            experience_years: 3,
            notes: 'Test driver profile created for system testing'
        };

        const newDriver = await Driver.create(driverData, driverUser.id);
        
        console.log('✅ Driver profile created successfully!');
        console.log('Driver ID:', newDriver.id);
        console.log('User ID:', newDriver.user_id);
        console.log('Driver Name:', newDriver.full_name);
        console.log('Email:', newDriver.email);
        
        console.log('\n📋 Driver login credentials:');
        console.log('Email: driver@waterplant.com');
        console.log('Password: password123');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error linking driver user:', error);
        process.exit(1);
    }
}

linkDriverUser();