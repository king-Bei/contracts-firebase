require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Add rejection_reason to contracts
        console.log('Adding rejection_reason to contracts table...');
        await client.query(`
      ALTER TABLE contracts 
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
    `);

        // Add requires_approval to contract_templates
        console.log('Adding requires_approval to contract_templates table...');
        await client.query(`
      ALTER TABLE contract_templates 
      ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT TRUE;
    `);

        await client.query('COMMIT');
        console.log('Migration completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
