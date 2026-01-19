require('dotenv').config();
const db = require('./src/db');
const bcrypt = require('bcryptjs');

async function resetDatabase() {
  console.log('⚠️  Starting Database Reset (Keeping Templates)...');

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Backup Templates
    console.log('📦 Backing up contract templates...');
    // We assume table exists. If not, this might fail, but that's fine for a reset script.
    // Check if table exists first to avoid error if it's the very first run
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'contract_templates'
      );
    `);

    let templateData = [];
    if (checkTable.rows[0].exists) {
      const res = await client.query('SELECT * FROM contract_templates');
      templateData = res.rows;
    }

    // 2. Drop Tables
    console.log('🔥 Dropping tables...');
    await client.query(`DROP TABLE IF EXISTS contracts CASCADE`);
    await client.query(`DROP TABLE IF EXISTS files CASCADE`); // Assuming 'files' exists or will exist
    await client.query(`DROP TABLE IF EXISTS users CASCADE`);
    await client.query(`DROP TABLE IF EXISTS contract_templates CASCADE`);
    await client.query(`DROP TABLE IF EXISTS audit_logs CASCADE`);
    // Drop other tables if any...

    // 3. Re-create Tables (Importing logic from models generally better, but for script simplicity we define SQL here or call model Init)
    console.log('🏗️  Re-creating tables...');

    // Users
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'salesperson', -- 'admin', 'manager', 'salesperson'
        is_active BOOLEAN DEFAULT TRUE,
        is_sales BOOLEAN DEFAULT FALSE,
        is_manager BOOLEAN DEFAULT FALSE,
        can_manage_users BOOLEAN DEFAULT FALSE,
        can_view_all_contracts BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Contract Templates (Enhanced with 'code')
    await client.query(`
      CREATE TABLE contract_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        logo_url TEXT,
        variables JSONB,
        code CHAR(4) UNIQUE, -- New Field
        requires_approval BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Files (For PDF storage)
    await client.query(`
        CREATE TABLE files (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            filename VARCHAR(255) NOT NULL,
            mimetype VARCHAR(100),
            size BIGINT,
            data BYTEA, -- Storing in DB for simplicity as per current usage, or just metadata if S3
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Contracts (Enhanced with 'contract_number' and 'signature_file_id')
    await client.query(`
      CREATE TABLE contracts (
        id SERIAL PRIMARY KEY,
        contract_number VARCHAR(50) UNIQUE, -- New Field: <Code><Year><Seq>
        template_id INT NOT NULL REFERENCES contract_templates(id),
        salesperson_id INT NOT NULL REFERENCES users(id),
        variable_values JSONB NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL',
        client_name VARCHAR(255),
        verification_code_hash VARCHAR(255),
        verification_code_plaintext VARCHAR(6),
        signing_link_token VARCHAR(255) UNIQUE,
        short_link_code VARCHAR(50) UNIQUE,
        signature_image TEXT,
        signature_file_id UUID REFERENCES files(id), -- Link to the final signed PDF
        rejection_reason TEXT,
        signed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Audit Logs
    await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            action VARCHAR(50) NOT NULL,
            resource_id VARCHAR(50),
            details JSONB,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 4. Restore Templates
    if (templateData.length > 0) {
      console.log(`♻️  Restoring ${templateData.length} templates...`);
      for (const t of templateData) {
        // If the old template didn't have a code, we generate a dummy one or leave null if allowed?
        // User requirement: "合約代碼新增後不能修改". We need to assign codes for existing templates.
        // Strategy: Convert ID to 4-digit code (e.g. 0001) for migration.
        let code = t.code;
        if (!code) {
          code = String(t.id).padStart(4, '0');
        }

        await client.query(`
                INSERT INTO contract_templates (id, name, content, logo_url, variables, code, requires_approval, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (id) DO NOTHING -- or UPDATE
            `, [t.id, t.name, t.content, t.logo_url, JSON.stringify(t.variables || []), code, t.requires_approval, t.is_active, t.created_at, t.updated_at]);

        // Update sequence for serial ID
        await client.query(`SELECT setval('contract_templates_id_seq', (SELECT MAX(id) FROM contract_templates))`);
      }
    }

    // 5. Create Super Admin
    console.log('👤 Creating Super Admin...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin7748', salt);

    await client.query(`
      INSERT INTO users (employee_id, name, password_hash, role, can_manage_users, can_view_all_contracts, is_manager, is_sales)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, ['jollifyadmin', 'Jollify Super Admin', hashedPassword, 'admin', true, true, true, true]);

    await client.query('COMMIT');
    console.log('✅ Database reset complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database reset failed:', error);
  } finally {
    client.release();
    process.exit();
  }
}

resetDatabase();
