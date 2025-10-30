const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'AADataBase',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'admin',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('PostgreSQL connection error:', err);
    process.exit(-1);
});

// Initialize database using advanced migration
const initializeDatabase = async () => {
    try {
        const { runMigration } = require('../migrations/advanced-migration');
        await runMigration();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    }
};

module.exports = {
    pool,
    initializeDatabase
};