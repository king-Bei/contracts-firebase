// src/db.js

const { Pool } = require('pg');

// 從環境變數中讀取資料庫連線 URL
// 這是連接到 Supabase 或其他託管資料庫的推薦方式
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set. Please check your .env file.');
}

const pool = new Pool({
  connectionString: connectionString,
  // 連接到 Supabase 或其他雲端資料庫需要 SSL
  ssl: {
    rejectUnauthorized: false, // 在本地開發時可以接受，生產環境建議使用更嚴格的設定
  },
  client_encoding: 'UTF8',
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