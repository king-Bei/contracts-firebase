
require('dotenv').config();
const contractModel = require('./src/models/contractModel');
const db = require('./src/db');
const { normalizeVariableValues } = require('./src/utils/templateUtils');

async function reproduce() {
    try {
        console.log('Starting exact reproduction script...');

        // 1. Find a salesperson user
        const userRes = await db.query("SELECT id FROM users WHERE role = 'salesperson' LIMIT 1");
        if (userRes.rows.length === 0) throw new Error('No salesperson found');
        const salespersonId = userRes.rows[0].id;
        console.log('Salesperson ID:', salespersonId);

        // 2. Find a template
        const templateRes = await db.query("SELECT id, variables FROM contract_templates LIMIT 1");
        if (templateRes.rows.length === 0) throw new Error('No template found');
        const template = templateRes.rows[0];

        // 3. Create Contract
        const contract = await contractModel.create({
            salesperson_id: salespersonId,
            template_id: template.id,
            client_name: 'Test Client',
            variable_values: {}
        });
        console.log('Created contract:', contract.id);

        // 4. Reject it
        await contractModel.reject(contract.id, 999, 'Test Reason');

        // 5. Simulate Controller Logic
        const contractFetched = await contractModel.findById(contract.id);
        const isResubmit = contractFetched.status === 'REJECTED';

        let templateVariables = [];
        try {
            // Logic from salesController
            if (Array.isArray(contractFetched.template_variables)) {
                templateVariables = contractFetched.template_variables;
            } else if (contractFetched.template_variables) {
                templateVariables = JSON.parse(contractFetched.template_variables || '[]');
            }
        } catch (err) {
            templateVariables = [];
        }

        const reqBodyVariables = { some_new_var: 'new_value' }; // simulate req.body.variables

        const normalizedVariables = normalizeVariableValues(reqBodyVariables, templateVariables);
        console.log('Normalized Variables:', normalizedVariables);

        const updated = await contractModel.update(contractFetched.id, {
            client_name: 'Updated Client Name',
            variable_values: normalizedVariables,
            resubmit: isResubmit
        });

        console.log('Update result:', updated);
        process.exit(0);

    } catch (error) {
        console.error('Caught Error:');
        console.error(error);
        process.exit(1);
    }
}

reproduce();
