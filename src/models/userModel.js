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
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'salesperson')),
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
  const queryText = 'SELECT id, employee_id, role, name, is_active FROM users WHERE id = $1';
  const { rows } = await db.query(queryText, [id]);
  return rows[0] || null;
}

/**
 * 建立新使用者 (主要由管理員使用)。
 * @param {object} userData - 包含 employee_id, password, role, name 的物件。
 * @returns {object} - 新建立的使用者物件 (不含密碼)。
 */
async function create({ employee_id, password, role, name }) {
  // 將明文密碼進行雜湊處理
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);

  const queryText = `
    INSERT INTO users (employee_id, password_hash, role, name)
    VALUES ($1, $2, $3, $4)
    RETURNING id, employee_id, role, name, is_active, created_at;
  `;
  const values = [employee_id, password_hash, role, name];
  const { rows } = await db.query(queryText, values);
  return rows[0];
}

/**
 * 查找所有使用者 (供管理員介面使用)。
 * @returns {Array<object>} - 使用者物件陣列。
 */
async function findAll() {
  // 查詢時排除 password_hash 欄位以策安全
  const queryText = 'SELECT id, employee_id, role, name, is_active, created_at, updated_at FROM users ORDER BY id ASC';
  const { rows } = await db.query(queryText);
  return rows;
}

/**
 * 更新使用者資訊 (不包含密碼)。
 * @param {number} id - 使用者 ID。
 * @param {object} fields - 包含 name, role, is_active 的物件。
 * @returns {object|null} - 更新後的使用者物件或 null。
 */
async function update(id, { name, role, is_active }) {
  const queryText = `
    UPDATE users
    SET name = $1, role = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING id, employee_id, role, name, is_active;
  `;
  const values = [name, role, is_active, id];
  const { rows } = await db.query(queryText, values);
  return rows[0] || null;
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


module.exports = {
  createUsersTable,
  findByEmployeeId,
  findById,
  create,
  findAll,
  update,
  deactivate,
};