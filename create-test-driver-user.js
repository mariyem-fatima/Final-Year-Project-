// Create a test driver user for testing dropdown functionality
const { pool } = require('./models/database');
const User = require('./models/User');

async function createTestDriverUser() {
    try {
        console.log('Creating test driver user...');

        const testUser = await User.create({
            email: 'testdriver2@test.com',
            password: 'password123',
            role: 'driver'
        });

        console.log('✅ Test driver user created:');
        console.log('- Email:', testUser.email);
        console.log('- ID:', testUser.id);
        console.log('- Role:', testUser.role);
        console.log('\nThis user should now appear in the driver assignment dropdown!');
        
        process.exit(0);
    } catch (error) {
        if (error.message && error.message.includes('already exists')) {
            console.log('✅ Test driver user already exists');
        } else {
            console.error('❌ Error creating test driver user:', error.message);
        }
        process.exit(1);
    }
}

createTestDriverUser();