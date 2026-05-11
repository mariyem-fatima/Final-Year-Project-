require('dotenv').config(); 
const { pool } = require('./models/database'); 
const queries = [ 
    `CREATE TABLE IF NOT EXISTS bottle_history ( 
        id SERIAL PRIMARY KEY, 
        bottle_id INTEGER REFERENCES bottles(id) ON DELETE CASCADE, 
        previous_status VARCHAR(50), 
        new_status VARCHAR(50), 
        changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL, 
        change_reason TEXT, 
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
    )`, 
    `CREATE TABLE IF NOT EXISTS bottle_delivery_history ( 
        id SERIAL PRIMARY KEY, 
        bottle_id INTEGER REFERENCES bottles(id) ON DELETE CASCADE, 
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL, 
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL, 
        assignment_id INTEGER REFERENCES order_assignments(id) ON DELETE SET NULL, 
        delivered_by INTEGER REFERENCES users(id) ON DELETE SET NULL, 
        status_from VARCHAR(50), 
        status_to VARCHAR(50), 
        notes TEXT, 
        delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
    )`, 
    `CREATE TABLE IF NOT EXISTS bottle_deliveries ( 
        id SERIAL PRIMARY KEY, 
        order_assignment_id INTEGER REFERENCES order_assignments(id) ON DELETE CASCADE, 
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL, 
        bottle_id INTEGER REFERENCES bottles(id) ON DELETE CASCADE, 
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL, 
        bottle_code VARCHAR(50), 
        delivery_date DATE, 
        driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL, 
        vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL, 
        delivery_notes TEXT, 
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
    )` 
]; 
Promise.all(queries.map(q => pool.query(q)))
    .then(() => { console.log('Tables created'); pool.end(); })
    .catch(err => { console.error(err.message); pool.end(); });
