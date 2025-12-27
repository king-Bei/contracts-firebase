const db = require('../db');

/**
 * Check and create 'audit_logs' table.
 */
async function createAuditLogsTable() {
    const queryText = `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INT, -- Nullable for system actions or unauthenticated attempts
      action VARCHAR(50) NOT NULL,
      resource_id VARCHAR(255),
      details JSONB,
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
    try {
        await db.query(queryText);
        console.log('Audit logs table checked/created successfully.');
    } catch (error) {
        console.error('Error creating audit logs table:', error.message);
        throw error;
    }
}

/**
 * Create an audit log entry.
 * @param {object} logData
 */
async function log({ user_id, action, resource_id, details, ip_address, user_agent }) {
    try {
        const queryText = `
      INSERT INTO audit_logs (user_id, action, resource_id, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
        const values = [
            user_id || null,
            action,
            resource_id || null,
            JSON.stringify(details || {}),
            ip_address || null,
            user_agent || null
        ];
        await db.query(queryText, values);
    } catch (error) {
        console.error('Failed to write audit log:', error);
        // Don't throw, we don't want to break the app flow for logging failure
    }
}

module.exports = {
    createAuditLogsTable,
    log,
};
