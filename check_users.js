
require('dotenv').config();
const db = require('./src/db');

async function listUsers() {
    try {
        const res = await db.query('SELECT id, employee_id, name, role, is_sales, is_manager, can_manage_users, can_view_all_contracts FROM users ORDER BY id');
        console.table(res.rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listUsers();
