// src/db.js

const { Pool } = require('pg');

// 從環境變數中讀取資料庫連線資訊
let connectionString = process.env.DATABASE_URL;

// 特殊處理：如果 DATABASE_URL 中的密碼包含 @ 符號，可能會導致 pg 解析錯誤
if (connectionString && connectionString.includes('@') && connectionString.split('@').length > 2) {
  console.log('DEBUG: Detected potential unencoded @ in DATABASE_URL. Attempting fix...');
  try {
    const parts = connectionString.match(/^(postgresql:\/\/)([^:]+):(.+)(@.+)$/);
    if (parts) {
      const [, proto, user, pass, hostPortDb] = parts;
      // 如果密碼中還有 @，將其編碼
      if (pass.includes('@')) {
        connectionString = `${proto}${user}:${encodeURIComponent(pass)}${hostPortDb}`;
        console.log('DEBUG: Encoded password @ in connectionString.');
      }
    }
  } catch (e) {
    console.warn('DEBUG: Failed to auto-fix connectionString encoding:', e.message);
  }
}

const dbConfig = connectionString ? { connectionString } : {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
};

// 延後檢查：不要在 require 時拋出錯誤，讓伺服器能先啟動以便查看日誌
if (!connectionString && !process.env.DB_HOST) {
  console.error('❌ 嚴重錯誤：找不到資料庫配置！');
  console.error('ℹ️  請設定 DATABASE_URL (推薦) 或由 DB_USER, DB_HOST, DB_NAME, DB_PASSWORD 組成的細項配置。');
  console.error('ℹ️  目前環境變數:', {
    DATABASE_URL: connectionString ? '已設定 (隱藏)' : '未設定',
    DB_HOST: process.env.DB_HOST || '未設定',
    NODE_ENV: process.env.NODE_ENV
  });
}

const pool = new Pool({
  ...dbConfig,
  // 連接到 Supabase 或其他雲端資料庫需要 SSL
  // 在 Cloud Run 環境 (PORT=8080 且有 K_SERVICE) 或非 localhost 時強制啟用 SSL
  ssl: (process.env.K_SERVICE || (process.env.DB_HOST && !process.env.DB_HOST.includes('localhost'))) ? {
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