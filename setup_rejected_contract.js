
require('dotenv').config();
const contractModel = require('./src/models/contractModel');
const db = require('./src/db');

async function setup() {
    try {
        const userRes = await db.query("SELECT id FROM users WHERE role = 'salesperson' LIMIT 1");
        const salespersonId = userRes.rows[0].id;

        const templateRes = await db.query("SELECT id FROM contract_templates LIMIT 1");
        const templateId = templateRes.rows[0].id;

        const contract = await contractModel.create({
            salesperson_id: salespersonId,
            template_id: templateId,
            client_name: 'Rejected Client',
            variable_values: {}
        });

        await contractModel.reject(contract.id, 999, 'Forced Rejection for Testing');
        console.log('Setup Rejected Contract ID:', contract.id);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

setup();
