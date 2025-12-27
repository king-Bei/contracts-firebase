require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/db');
const userModel = require('./src/models/userModel');
const contractTemplateModel = require('./src/models/contractTemplateModel');
const contractModel = require('./src/models/contractModel');
const fileModel = require('./src/models/fileModel');
const auditLogModel = require('./src/models/auditLogModel');

const adminConfig = {
    employee_id: 'Jollifytravel',
    password: 'Jet@7748',
    name: 'System Admin',
    role: 'admin',
};

async function resetProduction() {
    console.log('⚠️  STARTING PRODUCTION RESET ⚠️');
    console.log('1. Ensuring DB Schema is up to date...');

    // Ensure tables exist first
    await userModel.createUsersTable();
    await contractTemplateModel.createContractTemplatesTable();
    // contractModel depends on users and templates
    // fileModel and auditLogModel are independent
    await fileModel.createStorageFilesTable();
    await auditLogModel.createAuditLogsTable();
    await contractModel.createContractsTable();

    console.log('2. Clearing Data (Templates Preserved)...');

    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // Clear operational data
        console.log('Deleting audit logs...');
        await client.query('TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE');

        console.log('Deleting contracts...');
        // We use DELETE instead of TRUNCATE for contracts to verify constraints if needed,
        // but TRUNCATE is cleaner for reset.
        // contracts has FK to users and templates. FK to templates is fine (we keep templates).
        // contracts has FK to users (we will delete users).
        await client.query('TRUNCATE TABLE contracts RESTART IDENTITY CASCADE');

        console.log('Deleting storage files...');
        await client.query('TRUNCATE TABLE storage_files RESTART IDENTITY CASCADE');

        console.log('Deleting users...');
        await client.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');

        // 2. Re-create Admin User
        console.log(`Creating admin user: ${adminConfig.employee_id}...`);
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(adminConfig.password, salt);

        const insertUserQuery = `
      INSERT INTO users (employee_id, password_hash, role, name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, employee_id;
    `;
        await client.query(insertUserQuery, [
            adminConfig.employee_id,
            password_hash,
            adminConfig.role,
            adminConfig.name
        ]);

        await client.query('COMMIT');
        console.log('✅  System Reset Complete.');
        console.log(`Admin User: ${adminConfig.employee_id}`);
        console.log(`Password: ${adminConfig.password}`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌  Reset Failed:', error);
    } finally {
        client.release();
        await db.end();
    }
}

resetProduction();
