// src/models/userModel.js

const bcrypt = require('bcryptjs');
const db = require('../db');

/**
 * 檢查並創建 'users' 資料表 (如果不存在)。
 * 這是系統首次啟動時需要執行的操作。
 */
async function createUsersTable() {
  const queryText = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      employee_id VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'salesperson', 'manager')),
      is_sales BOOLEAN DEFAULT FALSE,
      is_manager BOOLEAN DEFAULT FALSE,
      can_manage_users BOOLEAN DEFAULT FALSE,
      can_view_all_contracts BOOLEAN DEFAULT FALSE,
      name VARCHAR(100) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await db.query(queryText);
    console.log('Users table checked/created successfully.');
  } catch (error) {
    console.error('Error creating users table:', error.message);
    throw error;
  }
}

/**
 * 根據員工編號查找使用者 (用於登入)。
 * @param {string} employeeId - 員工編號。
 * @returns {object|null} - 使用者物件或 null。
 */
async function findByEmployeeId(employeeId) {
  const queryText = 'SELECT * FROM users WHERE employee_id = $1';
  const { rows } = await db.query(queryText, [employeeId]);
  return rows[0] || null;
}

/**
 * 根據 ID 查找使用者。
 * @param {number} id - 使用者 ID。
 * @returns {object|null} - 使用者物件或 null。
 */
async function findById(id) {
  const queryText = 'SELECT id, employee_id, role, name, is_active, is_sales, is_manager, can_manage_users, can_view_all_contracts FROM users WHERE id = $1';
  const { rows } = await db.query(queryText, [id]);
  return rows[0] || null;
}

/**
 * 查找使用者並包含密碼雜湊（用於變更密碼）。
 * @param {number} id
 * @returns {object|null}
 */
async function findByIdWithPassword(id) {
  const queryText = 'SELECT id, employee_id, role, name, is_active, password_hash FROM users WHERE id = $1';
  const { rows } = await db.query(queryText, [id]);
  return rows[0] || null;
}

/**
 * 建立新使用者 (主要由管理員使用)。
 * @param {object} userData - 包含 employee_id, password, role, name 的物件。
 * @returns {object} - 新建立的使用者物件 (不含密碼)。
 */
async function create({ employee_id, password, name, role, is_sales, is_manager, can_manage_users, can_view_all_contracts }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const queryText = `
    INSERT INTO users (employee_id, password_hash, name, role, is_sales, is_manager, can_manage_users, can_view_all_contracts)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, employee_id, name, role, is_sales, is_manager, can_manage_users, can_view_all_contracts, created_at;
  `;
  // Default logic if flags not provided: map from role
  let salesFlag = is_sales;
  let managerFlag = is_manager;
  let userManageFlag = can_manage_users;
  let contractViewFlag = can_view_all_contracts;

  if (salesFlag === undefined) salesFlag = (role === 'salesperson' || role === 'admin');
  if (managerFlag === undefined) managerFlag = (role === 'manager' || role === 'admin');
  if (userManageFlag === undefined) userManageFlag = (role === 'admin');
  if (contractViewFlag === undefined) contractViewFlag = (role === 'admin');

  const { rows } = await db.query(queryText, [employee_id, passwordHash, name, role, salesFlag, managerFlag, userManageFlag, contractViewFlag]);
  return rows[0];
}

/**
 * 查找所有使用者 (供管理員介面使用)。
 * @returns {Array<object>} - 使用者物件陣列。
 */
async function findAll() {
  // 查詢時排除 password_hash 欄位以策安全
  const queryText = 'SELECT id, employee_id, role, name, is_active, is_sales, is_manager, can_manage_users, can_view_all_contracts, created_at, updated_at FROM users ORDER BY id ASC';
  const { rows } = await db.query(queryText);
  return rows;
}

/**
 * 更新使用者資訊 (不包含密碼)。
 * @param {number} id - 使用者 ID。
 * @param {object} fields - 包含 name, role, is_active 的物件。
 * @returns {object|null} - 更新後的使用者物件或 null。
 */
async function update(id, { name, role, is_active, is_sales, is_manager, can_manage_users, can_view_all_contracts }) {
  // Build dynamic update query
  const updates = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) {
    updates.push(`name = $${idx++}`);
    values.push(name);
  }
  if (role !== undefined) {
    updates.push(`role = $${idx++}`);
    values.push(role);
  }
  if (is_active !== undefined) {
    updates.push(`is_active = $${idx++}`);
    values.push(is_active);
  }
  if (is_sales !== undefined) {
    updates.push(`is_sales = $${idx++}`);
    values.push(is_sales);
  }
  if (is_manager !== undefined) {
    updates.push(`is_manager = $${idx++}`);
    values.push(is_manager);
  }
  if (can_manage_users !== undefined) {
    updates.push(`can_manage_users = $${idx++}`);
    values.push(can_manage_users);
  }
  if (can_view_all_contracts !== undefined) {
    updates.push(`can_view_all_contracts = $${idx++}`);
    values.push(can_view_all_contracts);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const queryText = `
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $${idx}
    RETURNING id, employee_id, name, role, is_sales, is_manager, can_manage_users, can_view_all_contracts, is_active;
  `;

  const { rows } = await db.query(queryText, values);
  return rows[0];
}

/**
 * 停用使用者 (軟刪除)。
 * @param {number} id - 使用者 ID。
 * @returns {object|null} - 更新後的使用者物件或 null。
 */
async function deactivate(id) {
  const queryText = `
    UPDATE users
    SET is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, employee_id, is_active;
  `;
  const { rows } = await db.query(queryText, [id]);
  return rows[0] || null;
}

/**
 * 更新使用者密碼。
 * @param {number} id
 * @param {string} newPassword
 * @returns {object|null}
 */
async function updatePassword(id, newPassword) {
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(newPassword, salt);
  const queryText = `
    UPDATE users
    SET password_hash = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING id, employee_id, role, name, is_active;
  `;
  const { rows } = await db.query(queryText, [password_hash, id]);
  return rows[0] || null;
}

module.exports = {
  createUsersTable,
  findByEmployeeId,
  findById,
  findByIdWithPassword,
  create,
  findAll,
  update,
  deactivate,
  updatePassword,
};
