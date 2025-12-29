require('dotenv').config();
const db = require('./src/db');

async function migratePermissions() {
    try {
        console.log('Adding permission flags to users table...');

        // Add columns
        await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_sales BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_manager BOOLEAN DEFAULT FALSE;
    `);
        console.log('Columns added.');

        // Migrate existing data
        console.log('Migrating existing roles...');

        // Salesperson -> is_sales=true
        await db.query(`
      UPDATE users 
      SET is_sales = TRUE, is_manager = FALSE 
      WHERE role = 'salesperson';
    `);

        // Manager -> is_manager=true
        await db.query(`
      UPDATE users 
      SET is_sales = FALSE, is_manager = TRUE 
      WHERE role = 'manager';
    `);

        // Admin -> Both true (Superuser access usually implies capability)
        await db.query(`
      UPDATE users 
      SET is_sales = TRUE, is_manager = TRUE 
      WHERE role = 'admin';
    `);

        console.log('Permissions migrated successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await db.end();
    }
}

migratePermissions();
