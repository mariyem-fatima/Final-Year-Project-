// Test driver dashboard data
const { pool } = require('./models/database');
const Driver = require('./models/Driver');
const OrderAssignment = require('./models/OrderAssignment');

async function testDriverData() {
    try {
        console.log('Testing driver dashboard data...');

        // Find driver by user_id 5 (our test driver)
        const driver = await Driver.findByUserId(5);
        console.log('Driver found:', driver ? driver.id : 'None');

        if (driver) {
            const today = new Date().toISOString().split('T')[0];
            console.log('Looking for assignments on:', today);
            
            const assignments = await OrderAssignment.findByDriverAndDate(driver.id, today);
            console.log('Assignments found:', assignments.length);
            
            assignments.forEach((assignment, index) => {
                console.log(`\nOrder ${index + 1}:`);
                console.log('- Order ID:', assignment.order_id);
                console.log('- Assignment ID:', assignment.id);
                console.log('- Customer:', assignment.customer_name);
                console.log('- Total Bottles:', assignment.total_bottles);
                console.log('- Status:', assignment.delivery_status);
                console.log('- Address:', assignment.customer_address);
                console.log('- Phone:', assignment.customer_phone);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

testDriverData();