// createAdmin.js
// 这是一个一次性脚本，用于创建系统中的第一个管理员用户。
// 使用方法: node createAdmin.js

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/db');

// --- 请在这里配置您的第一个管理员账户 ---
const adminConfig = {
  employee_id: 'jollityadmin',
  password: '00116098', // 目标密码
  name: '系统管理员',
  role: 'admin',
};
// -----------------------------------------

async function createAdmin() {
  console.log('开始创建管理员用户...');

  try {
    // 检查数据库连接
    const client = await db.getClient();
    console.log('数据库连接成功。');

    // 检查用户是否已存在
    const checkUser = await client.query('SELECT * FROM users WHERE employee_id = $1', [adminConfig.employee_id]);
    if (checkUser.rows.length > 0) {
      console.log(`用户 '${adminConfig.employee_id}' 已存在，脚本终止。`);
      client.release();
      return;
    }

    console.log(`用户 '${adminConfig.employee_id}' 不存在，开始创建...`);

    // Hashing the password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(adminConfig.password, salt);
    console.log('密码已加密。');

    // Inserting the new admin user
    const queryText = `
      INSERT INTO users (employee_id, password_hash, role, name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, employee_id, role, name;
    `;
    const values = [adminConfig.employee_id, password_hash, adminConfig.role, adminConfig.name];
    const { rows } = await client.query(queryText, values);

    console.log('✅ 管理员用户创建成功！');
    console.log('---------------------------------');
    console.log('ID:', rows[0].id);
    console.log('员工ID (登录账号):', rows[0].employee_id);
    console.log('姓名:', rows[0].name);
    console.log('角色:', rows[0].role);
    console.log('---------------------------------');
    console.log('现在您可以使用此账号登录系统了。');

    client.release();
  } catch (error) {
    console.error('❌ 创建管理员时发生错误:', error);
  } finally {
    await db.end();
    console.log('数据库连接已关闭。');
  }
}

createAdmin();
