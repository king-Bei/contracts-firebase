// 確保在執行腳本時能加載 .env 檔案
require('dotenv').config();

const db = require('./db'); // 引入我們的資料庫連線設定

// 根據您的 README 檔案定義範本資料
const templates = [
  {
    name: '團體旅遊契約',
    // 注意：這裡的 content 應為您 EJS 範本的完整 HTML/文字內容
    content: '<h1>團體旅遊契約</h1><p>行程名稱: {{ tourName }}</p><!-- ... 更多範本內容 ... -->',
    variables: [
      { name: 'tourName', label: '行程名稱', type: 'text' },
      { name: 'groupCode', label: '團號', type: 'text' },
      { name: 'country', label: '旅遊地區', type: 'text' },
      { name: 'departureDate', label: '出發日期', type: 'date' },
      { name: 'departureTime', label: '集合/出發時間', type: 'text' },
      { name: 'price', label: '旅遊費用', type: 'number' },
      { name: 'paymentMethod', label: '付款方式', type: 'text' },
      { name: 'deposit', label: '訂金金額', type: 'number' },
      { name: 'minGroupSize', label: '成團人數下限', type: 'number' },
      { name: 'cancelNoticeDays', label: '取消通知天數', type: 'number' },
      { name: 'consentCheck', label: '旅客確認事項', type: 'checkbox' },
      { name: 'customCheck', label: '自填勾選欄位', type: 'checkbox' },
      { name: 'customField', label: '其他填寫欄位', type: 'textarea' },
    ],
  },
  {
    name: '個別旅遊契約',
    content: '<h1>個別旅遊契約</h1><p>旅客姓名: {{ travelerName }}</p><!-- ... 更多範本內容 ... -->',
    variables: [
      { name: 'travelerName', label: '旅客姓名', type: 'text' },
      { name: 'agentName', label: '旅行社名稱', type: 'text' },
      { name: 'createdAt', label: '簽約日期', type: 'date' },
      { name: 'itinerary', label: '行程內容', type: 'textarea' },
      { name: 'hotel', label: '住宿資訊', type: 'text' },
      { name: 'flightInfo', label: '航班資訊', type: 'text' },
      { name: 'departureDate', label: '出發日期', type: 'date' },
      { name: 'departureTime', label: '出發時間', type: 'text' },
      { name: 'idNumber', label: '身分證號', type: 'text' },
      { name: 'phone', label: '電話', type: 'tel' },
      { name: 'address', label: '地址', type: 'text' },
      { name: 'salesName', label: '業務員', type: 'text' },
      // 簽名圖片是系統自動產生，通常不作為使用者輸入欄位
      // { name: 'signatureImgTag', label: '簽名圖片', type: 'signature' },
    ],
  },
  {
    name: '機票交易須知',
    content: '<h1>機票交易須知</h1><p>航空公司名稱: {{ airline }}</p><!-- ... 更多範本內容 ... -->',
    variables: [
      { name: 'airline', label: '航空公司名稱', type: 'text' },
      { name: 'flightNo', label: '機票號碼', type: 'text' },
      { name: 'ticketPrice', label: '機票票價', type: 'number' },
      { name: 'validFrom', label: '使用起始日', type: 'date' },
      { name: 'validTo', label: '使用截止日', type: 'date' },
      { name: 'expiryDate', label: '機票到期日', type: 'date' },
      { name: 'minStay', label: '最短停留天數', type: 'number' },
      { name: 'minStayType', label: '停留依據 (出發/抵達/折返)', type: 'text' },
      { name: 'maxStay', label: '最長停留天數', type: 'number' },
      { name: 'segmentLimit', label: '航段限制', type: 'text' },
      { name: 'flightLimit', label: '航班限制', type: 'text' },
      { name: 'departureTimeLimit', label: '出發航班限制', type: 'text' },
      { name: 'returnTimeLimit', label: '回程航班限制', type: 'text' },
      { name: 'otherLimit', label: '其他限制', type: 'textarea' },
      { name: 'changeAllowed', label: '是否可更改', type: 'boolean' },
      { name: 'changeFee', label: '更改手續費', type: 'number' },
      { name: 'changePriceDiff', label: '更改是否需補價差', type: 'boolean' },
      { name: 'refundAllowed', label: '是否可退票', type: 'boolean' },
      { name: 'refundAgency', label: '退票單位', type: 'text' },
      { name: 'refundReason', label: '退票原因', type: 'text' },
      { name: 'refundFee', label: '退票手續費', type: 'number' },
      { name: 'baggagePieces', label: '行李件數', type: 'number' },
      { name: 'baggageWeight', label: '行李重量', type: 'text' },
      { name: 'baggageOther', label: '行李其他規定', type: 'textarea' },
      { name: 'otherNotes', label: '其他備註', type: 'textarea' },
      { name: 'contactInfo', label: '聯絡方式', type: 'text' },
    ],
  },
];

async function seedTemplates() {
  console.log('Seeding contract templates...');
  try {
    for (const template of templates) {
      // 檢查範本是否已存在
      const checkQuery = 'SELECT id FROM contract_templates WHERE name = $1';
      const { rows } = await db.query(checkQuery, [template.name]);

      if (rows.length > 0) {
        console.log(`Template "${template.name}" already exists. Skipping.`);
        continue;
      }

      // 插入新範本
      const insertQuery = `
        INSERT INTO contract_templates (name, content, variables)
        VALUES ($1, $2, $3)
      `;
      const values = [template.name, template.content, JSON.stringify(template.variables)];
      await db.query(insertQuery, values);
      console.log(`Template "${template.name}" seeded successfully.`);
    }
    console.log('Seeding completed.');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    // 結束資料庫連線
    await db.end();
  }
}

seedTemplates();