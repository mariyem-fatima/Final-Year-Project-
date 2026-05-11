const { pool } = require('./models/database');

const query = `
    SELECT 
        c.id as customer_id,
        c.full_name as customer_name,
        c.phone_primary,
        c.address_line1,
        c.city,
        COUNT(b.id) as bottles_count,
        ARRAY_AGG(
            CASE WHEN b.id IS NOT NULL THEN
                JSON_BUILD_OBJECT(
                    'bottle_code', b.bottle_code,
                    'bottle_type', b.bottle_type,
                    'delivered_at', b.delivered_at,
                    'delivered_by_email', u.email
                )
            END
        ) FILTER (WHERE b.id IS NOT NULL) as bottles
    FROM customers c
    LEFT JOIN bottles b ON c.id = b.current_customer_id AND b.status = 'AtCustomer'
    LEFT JOIN users u ON b.delivered_by = u.id
    GROUP BY c.id, c.full_name, c.phone_primary, c.address_line1, c.city
    ORDER BY c.full_name
`;

pool.query(query).then(res => { 
    console.log('Query 1 Success'); 
    
    const statsQuery = `
        SELECT 
            COUNT(DISTINCT b.current_customer_id) as customers_with_bottles,
            COUNT(b.id) as total_bottles_at_customers,
            COUNT(DISTINCT b.bottle_type) as bottle_types_in_circulation
        FROM bottles b
        WHERE b.status = 'AtCustomer' AND b.current_customer_id IS NOT NULL
    `;
    return pool.query(statsQuery);
}).then(() => {
    console.log('Query 2 Success');
    pool.end(); 
}).catch(err => { 
    console.error('Error:', err.message); 
    pool.end(); 
});
