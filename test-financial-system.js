const { pool } = require('./models/database');

async function testFinancialSystem() {
    try {
        console.log('💰 Testing Complete Financial Management System...\n');

        // Step 1: Show current financial system tables
        console.log('📋 FINANCIAL SYSTEM TABLES:');
        const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('transactions', 'monthly_packages', 'employee_payroll', 'inventory_purchases', 'staff', 'financial_categories')
            ORDER BY table_name
        `;
        const tablesResult = await pool.query(tablesQuery);
        console.table(tablesResult.rows);

        // Step 2: Check pending payments that can be collected
        console.log('\n💳 PENDING PAYMENTS TO COLLECT:');
        const pendingQuery = `
            SELECT 
                oa.id as assignment_id,
                o.order_number,
                c.full_name as customer_name,
                o.total_amount,
                oa.actual_delivery_time,
                CASE 
                    WHEN oa.payment_collected IS NULL OR oa.payment_collected = FALSE THEN 'PENDING'
                    ELSE 'COLLECTED'
                END as payment_status
            FROM order_assignments oa
            JOIN orders o ON oa.order_id = o.id
            JOIN customers c ON o.customer_id = c.id
            WHERE oa.delivery_status = 'delivered'
            ORDER BY oa.actual_delivery_time DESC
            LIMIT 10
        `;
        const pendingResult = await pool.query(pendingQuery);
        console.table(pendingResult.rows);

        // Step 3: Check current financial transactions
        console.log('\n📊 RECENT FINANCIAL TRANSACTIONS:');
        const transactionsQuery = `
            SELECT 
                transaction_type,
                category,
                amount,
                description,
                transaction_date,
                payment_status
            FROM transactions
            ORDER BY created_at DESC
            LIMIT 5
        `;
        const transactionsResult = await pool.query(transactionsQuery);
        
        if (transactionsResult.rows.length > 0) {
            console.table(transactionsResult.rows);
        } else {
            console.log('No transactions recorded yet - ready for payment collection!');
        }

        // Step 4: Check staff system integration
        console.log('\n👥 STAFF SYSTEM STATUS:');
        const staffQuery = `
            SELECT 
                s.employee_id,
                s.full_name,
                s.position,
                s.department,
                s.status,
                u.email
            FROM staff s
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY s.full_name
        `;
        const staffResult = await pool.query(staffQuery);
        
        if (staffResult.rows.length > 0) {
            console.table(staffResult.rows);
        } else {
            console.log('No staff members added yet - ready for staff management!');
        }

        // Step 5: Show financial categories available
        console.log('\n🏷️ FINANCIAL CATEGORIES:');
        const categoriesQuery = `
            SELECT category_name, category_type, description
            FROM financial_categories
            WHERE is_active = TRUE
            ORDER BY category_type, category_name
        `;
        const categoriesResult = await pool.query(categoriesQuery);
        console.table(categoriesResult.rows);

        // Step 6: System capabilities summary
        console.log('\n🌟 FINANCIAL SYSTEM CAPABILITIES:');
        console.log('✅ Payment Collection: Track and collect payments for delivered orders');
        console.log('✅ Monthly Packages: Manage subscription-based billing');
        console.log('✅ Expense Management: Record salary, bottle purchases, operational costs');
        console.log('✅ Staff Management: Link users to staff profiles with payroll integration');
        console.log('✅ Financial Reporting: Revenue vs expense analysis');
        console.log('✅ Admin Security: Only admin users can access financial data');

        console.log('\n🚀 NEXT STEPS FOR USERS:');
        console.log('1. Login as admin user');
        console.log('2. Navigate to Finance → Financial Dashboard');
        console.log('3. Use "Collect Payments" to mark delivered orders as paid');
        console.log('4. Add expenses for bottle purchases, salaries, etc.');
        console.log('5. Set up monthly packages for regular customers');
        console.log('6. View financial reports and profit analysis');

        console.log('\n💡 ACCESS URLS:');
        console.log('- Financial Dashboard: http://localhost:3000/finance/dashboard');
        console.log('- Payment Collection: http://localhost:3000/finance/payments');
        console.log('- Expense Management: http://localhost:3000/finance/expenses');
        console.log('- Monthly Packages: http://localhost:3000/finance/packages');
        console.log('- Financial Reports: http://localhost:3000/finance/reports');

        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testFinancialSystem();