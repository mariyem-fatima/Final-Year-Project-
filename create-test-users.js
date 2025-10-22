// Quick script to create test users with different roles
const { pool } = require('./models/database');
const User = require('./models/User');

async function createTestUsers() {
    try {
        console.log('Creating test users...');

        // Create a staff user
        try {
            const staffUser = await User.create({
                email: 'staff@waterplant.com',
                password: 'password123',
                role: 'staff'
            });
            console.log('✅ Staff user created:', staffUser.email);
        } catch (error) {
            console.log('Staff user might already exist');
        }

        // Create a driver user
        try {
            const driverUser = await User.create({
                email: 'driver@waterplant.com',
                password: 'password123',
                role: 'driver'
            });
            console.log('✅ Driver user created:', driverUser.email);
        } catch (error) {
            console.log('Driver user might already exist');
        }

        console.log('\n📋 Test user credentials:');
        console.log('Admin: admin@example.com / password123');
        console.log('Staff: staff@waterplant.com / password123');
        console.log('Driver: driver@waterplant.com / password123');
        
        process.exit(0);
    } catch (error) {
        console.error('Error creating test users:', error);
        process.exit(1);
    }
}

createTestUsers();