// src/db.js

const { Pool } = require('pg');

// 從環境變數中讀取資料庫連線資訊
const connectionString = process.env.DATABASE_URL;

const dbConfig = connectionString ? { connectionString } : {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
};

if (!connectionString && !process.env.DB_HOST) {
  throw new Error('Database configuration missing. Please set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.');
}

const pool = new Pool({
  ...dbConfig,
  // 連接到 Supabase 或其他雲端資料庫需要 SSL
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false,
  } : false,
  client_encoding: 'UTF8',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// 監聽連線池的錯誤
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1); // 發生嚴重錯誤時終止程式
});

console.log('PostgreSQL Connection Pool Initialized.');

// 匯出查詢函數，讓其他模組可以執行 SQL
module.exports = {
  // 基礎查詢函數
  query: (text, params) => pool.query(text, params),
  // 獲取一個客戶端 (用於交易操作)
  getClient: () => pool.connect(),
  // 增加一個 end 函數，方便在 seeding 等腳本結束後關閉連線
  end: () => pool.end(),
};