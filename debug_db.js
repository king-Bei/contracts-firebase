require('dotenv').config();
const db = require('./src/db');

async function checkTemplate() {
    try {
        const { rows } = await db.query('SELECT id, variables FROM contract_templates WHERE id = 1');
        console.log('Template 1:', JSON.stringify(rows[0], null, 2));

        // Check type of variables
        if (rows[0]) {
            console.log('Type of variables:', typeof rows[0].variables);
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkTemplate();
