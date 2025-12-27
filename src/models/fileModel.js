const db = require('../db');

/**
 * Check and create 'storage_files' table.
 */
async function createStorageFilesTable() {
    const queryText = `
    CREATE TABLE IF NOT EXISTS storage_files (
      id UUID PRIMARY KEY,
      mime_type VARCHAR(255) NOT NULL,
      data BYTEA NOT NULL,
      size INT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
    try {
        await db.query(queryText);
        console.log('Storage files table checked/created successfully.');
    } catch (error) {
        console.error('Error creating storage files table:', error.message);
        throw error;
    }
}

/**
 * Save a file to storage.
 * @param {object} fileData
 * @param {string} fileData.id - UUID
 * @param {string} fileData.mime_type
 * @param {Buffer} fileData.data
 * @param {number} fileData.size
 */
async function saveFile({ id, mime_type, data, size }) {
    const queryText = `
    INSERT INTO storage_files (id, mime_type, data, size)
    VALUES ($1, $2, $3, $4)
    RETURNING id;
  `;
    const values = [id, mime_type, data, size];
    const { rows } = await db.query(queryText, values);
    return rows[0];
}

/**
 * Get a file by ID.
 * @param {string} id - UUID
 */
async function getFile(id) {
    const queryText = 'SELECT * FROM storage_files WHERE id = $1';
    const { rows } = await db.query(queryText, [id]);
    return rows[0] || null;
}

module.exports = {
    createStorageFilesTable,
    saveFile,
    getFile,
};
