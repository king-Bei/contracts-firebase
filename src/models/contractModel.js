// src/models/contractModel.js

const db = require('../db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * 創建 'contracts' 資料表 (如果不存在)。
 */
async function createContractsTable() {
  const queryText = `
    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      template_id INT NOT NULL REFERENCES contract_templates(id),
      salesperson_id INT NOT NULL REFERENCES users(id),
      variable_values JSONB NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- e.g., 'DRAFT', 'PENDING_SIGNATURE', 'SIGNED'
      client_name VARCHAR(255),
      verification_code_hash VARCHAR(255), -- Hash of the code client needs to enter
      verification_code_plaintext VARCHAR(6), -- Plain code for internal reference
      signing_link_token VARCHAR(255) UNIQUE, -- Unique token for the signing link
      short_link_code VARCHAR(50) UNIQUE, -- Short code for compact signing link
      signature_image TEXT, -- Base64 data URL of the signature
      signed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await db.query(queryText);
    await db.query(queryText);
    await db.query('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS verification_code_plaintext VARCHAR(6);');
    await db.query('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS short_link_code VARCHAR(50);');
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_short_link_code ON contracts(short_link_code);');

    // New columns for re-architecture
    await db.query('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signature_file_id UUID;');

    // Determine if we should drop the plaintext code column for security (Migration step)
    // For now we just won't write to it, keeping data for legacy support if needed, 
    // but ideally: await db.query('ALTER TABLE contracts DROP COLUMN IF EXISTS verification_code_plaintext;');

    console.log('Contracts table checked/created successfully.');
  } catch (error) {
    console.error('Error creating contracts table:', error.message);
    throw error;
  }
}

async function generateUniqueShortCode() {
  while (true) {
    const candidate = crypto.randomBytes(4).toString('hex'); // 8 chars
    const { rows } = await db.query('SELECT 1 FROM contracts WHERE short_link_code = $1', [candidate]);
    if (rows.length === 0) {
      return candidate;
    }
  }
}

/**
 * 查找所有合約，並帶上關聯的範本與業務員名稱
 * @returns {Array<object>} - 合約物件陣列
 */
async function findAll() {
  const queryText = `
    SELECT
      c.id,
      c.status,
      c.client_name,
      c.signed_at,
      c.created_at,
      u.name as salesperson_name,
      ct.name as template_name
    FROM contracts c
    LEFT JOIN users u ON c.salesperson_id = u.id
    LEFT JOIN contract_templates ct ON c.template_id = ct.id
    ORDER BY c.created_at DESC;
  `;
  const { rows } = await db.query(queryText);
  return rows;
}

/**
 * 取得全站合約，並依條件篩選
 */
async function findAllWithFilters({ salespersonId, startDate, endDate, status } = {}) {
  const conditions = ['1=1'];
  const values = [];
  let idx = 1;

  if (salespersonId) {
    conditions.push(`c.salesperson_id = $${idx++}`);
    values.push(salespersonId);
  }
  if (startDate) {
    conditions.push(`c.created_at >= $${idx++}`);
    values.push(startDate);
  }
  if (endDate) {
    conditions.push(`c.created_at <= $${idx++}`);
    values.push(endDate);
  }
  if (status && status !== 'ALL') {
    conditions.push(`c.status = $${idx++}`);
    values.push(status);
  }

  const queryText = `
    SELECT
      c.id,
      c.status,
      c.client_name,
      c.signed_at,
      c.created_at,
      u.name as salesperson_name,
      ct.name as template_name
    FROM contracts c
    LEFT JOIN users u ON c.salesperson_id = u.id
    LEFT JOIN contract_templates ct ON c.template_id = ct.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.created_at DESC;
  `;
  const { rows } = await db.query(queryText, values);
  return rows;
}


/**
 * 建立一份新合約
 * @param {object} contractData
 * @returns {object} The created contract, including the plaintext verification code
 */
async function create(contractData) {
  const { salesperson_id, template_id, client_name, variable_values } = contractData;

  // 1. Generate unique signing token
  const signing_link_token = crypto.randomBytes(32).toString('hex');

  // 1b. Generate unique short link code for concise sharing
  const short_link_code = await generateUniqueShortCode();

  // 2. Generate 6-digit verification code
  const verification_code = Math.floor(100000 + Math.random() * 900000).toString();
  const verification_code_hash = await bcrypt.hash(verification_code, 10); // Using bcrypt for hashing

  // 3. Insert into database
  const queryText = `
    INSERT INTO contracts
      (salesperson_id, template_id, client_name, variable_values, signing_link_token, short_link_code, verification_code_hash, verification_code_plaintext, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING_SIGNATURE')
    RETURNING *;
  `;
  const values = [
    salesperson_id,
    template_id,
    client_name,
    variable_values,
    signing_link_token,
    short_link_code,
    verification_code_hash,
    verification_code, // Store plaintext code as requested by user
  ];

  const { rows } = await db.query(queryText, values);
  const newContract = rows[0];

  // Return the new contract ALONG WITH the plaintext verification code for one-time display
  return { ...newContract, verification_code };
}

async function findById(id) {
  const queryText = `
    SELECT
      c.id,
      c.status,
      c.client_name,
      c.variable_values,
      c.verification_code_hash,
      c.verification_code_plaintext,
      c.signing_link_token,
      c.short_link_code,
      c.signature_image,
      c.signature_file_id,
      c.signed_at,
      c.created_at,
      c.salesperson_id,
      u.name as salesperson_name,
      ct.name as template_name,
      ct.content as template_content,
      ct.variables as template_variables,
      ct.logo_url as template_logo_url
    FROM contracts c
    JOIN contract_templates ct ON c.template_id = ct.id
    LEFT JOIN users u ON c.salesperson_id = u.id
    WHERE c.id = $1;
  `;
  const { rows } = await db.query(queryText, [id]);
  return rows[0] || null;
}

/**
 * 根據 signing_link_token 查找合約及關聯的範本內容
 * @param {string} token - The unique signing link token
 * @returns {object|null} - The contract object or null if not found
 */
async function findByToken(token) {
  const queryText = `
    SELECT
      c.id,
      c.status,
      c.client_name,
      c.variable_values,
      c.verification_code_hash,
      c.verification_code_plaintext,
      c.short_link_code,
      c.signature_image,
      c.signature_file_id,
      c.signed_at,
      ct.name as template_name,
      ct.content as template_content,
      ct.logo_url as template_logo_url,
      ct.variables as template_variables
    FROM contracts c
    JOIN contract_templates ct ON c.template_id = ct.id
    WHERE c.signing_link_token = $1;
  `;
  const { rows } = await db.query(queryText, [token]);
  return rows[0] || null;
}


/**
 * 根據業務員 ID 查找其所有合約
 * @param {number} salespersonId - 業務員的使用者 ID
 * @returns {Array<object>} - 合約物件陣列
 */
async function findBySalesperson(salespersonId, { startDate, endDate, status } = {}) {
  const conditions = ['c.salesperson_id = $1'];
  const values = [salespersonId];
  let index = 2;

  if (startDate) {
    conditions.push(`c.created_at >= $${index++}`);
    values.push(startDate);
  }

  if (endDate) {
    conditions.push(`c.created_at <= $${index++}`);
    values.push(endDate);
  }

  if (status && status !== 'ALL') {
    conditions.push(`c.status = $${index++}`);
    values.push(status);
  }

  const queryText = `
    SELECT
      c.id,
      c.status,
      c.client_name,
      c.signed_at,
      c.created_at,
      c.short_link_code,
      ct.name as template_name
    FROM contracts c
    LEFT JOIN contract_templates ct ON c.template_id = ct.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.created_at DESC;
  `;

  const { rows } = await db.query(queryText, values);
  return rows;
}

async function update(id, { client_name, variable_values }) {
  const queryText = `
    UPDATE contracts
    SET client_name = $1,
        variable_values = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *;
  `;
  const { rows } = await db.query(queryText, [client_name, variable_values, id]);
  return rows[0] || null;
}

async function findByShortCode(code) {
  const queryText = `
    SELECT signing_link_token
    FROM contracts
    WHERE short_link_code = $1;
  `;

  const { rows } = await db.query(queryText, [code]);
  return rows[0] || null;
}

async function ensureShortLinkCode(contractId) {
  const queryText = `
    UPDATE contracts
    SET short_link_code = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING short_link_code;
  `;

  const shortCode = await generateUniqueShortCode();
  const { rows } = await db.query(queryText, [shortCode, contractId]);
  return rows[0]?.short_link_code || shortCode;
}

async function markAsSigned(id, signatureFileId, variableValues, legacySignatureImage = null) {
  const queryText = `
    UPDATE contracts
    SET status = 'SIGNED',
        signature_file_id = $1,
        signature_image = $2, -- Keeping legacy field for now if provided, or null
        variable_values = $3,
        signed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *;
  `;
  const { rows } = await db.query(queryText, [signatureFileId, legacySignatureImage, variableValues, id]);
  return rows[0] || null;
}

async function cancel(id, salespersonId) {
  const queryText = `
    UPDATE contracts
    SET status = 'CANCELLED',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND salesperson_id = $2
      AND status IN ('PENDING_SIGNATURE', 'DRAFT')
    RETURNING *;
  `;
  const { rows } = await db.query(queryText, [id, salespersonId]);
  return rows[0] || null;
}

module.exports = {
  createContractsTable,
  findAll,
  create,
  findById,
  findBySalesperson,
  findAllWithFilters,
  findByToken,
  findByShortCode,
  markAsSigned,
  update,
  ensureShortLinkCode,
  cancel,
};
