
require('dotenv').config();
const db = require('./src/db');

async function checkSchema() {
    try {
        const res = await db.query(`
            SELECT column_name, is_nullable, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'contracts' AND column_name = 'rejection_reason';
        `);
        console.table(res.rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
