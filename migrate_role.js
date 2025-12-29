require('dotenv').config();
const db = require('./src/db');

async function migrate() {
    try {
        console.log('Migrating users table to support manager role...');
        // Drop the existing check constraint
        await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`);

        // Add it back with 'manager'
        await db.query(`
      ALTER TABLE users 
      ADD CONSTRAINT users_role_check 
      CHECK (role IN ('admin', 'salesperson', 'manager'));
    `);

        console.log('Successfully updated users table constraint.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await db.end();
    }
}

migrate();
