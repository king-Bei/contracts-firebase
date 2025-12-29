require('dotenv').config();
const db = require('./src/db');

async function migrateAdminPermissions() {
    try {
        console.log('Adding granular admin permission flags...');

        // Add columns
        await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS can_manage_users BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS can_view_all_contracts BOOLEAN DEFAULT FALSE;
    `);
        console.log('Columns added.');

        // Migrate existing Admin data
        console.log('Migrating existing admins...');

        // Admin -> Both true
        await db.query(`
      UPDATE users 
      SET can_manage_users = TRUE, can_view_all_contracts = TRUE 
      WHERE role = 'admin';
    `);

        console.log('Admin permissions migrated successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await db.end();
    }
}

migrateAdminPermissions();
