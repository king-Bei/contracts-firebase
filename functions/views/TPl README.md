# 📑 合約模板說明 (EJS)

本專案的 PDF 由 `pdfService.js` 搭配 **EJS 模板** 產生，所有模板放在 `src/templates/` 下。  
目前支援三種合約類型：

- `tpl_group.ejs` → 團體旅遊契約
- `tpl_individual.ejs` → 個別旅遊契約
- `tpl_flight.ejs` → 機票交易須知

---

## 1️⃣ 團體旅遊契約 (tpl_group.ejs)

### 對應欄位 (defaultFieldsFor('group'))
| 變數             | 說明          |
|------------------|---------------|
| tourName         | 行程名稱      |
| groupCode        | 團號          |
| country          | 旅遊地區      |
| departureDate    | 出發日期      |
| departureTime    | 集合/出發時間 |
| price            | 旅遊費用      |
| paymentMethod    | 付款方式      |
| deposit          | 訂金金額      |
| minGroupSize     | 成團人數下限  |
| cancelNoticeDays | 取消通知天數  |
| consentCheck     | 旅客確認事項  |
| customCheck      | 自填勾選欄位  |
| customField      | 其他填寫欄位  |

### 通用欄位
| 變數         | 說明         |
|--------------|--------------|
| travelerName | 旅客姓名     |
| agentName    | 旅行社名稱   |
| createdAt    | 建立日期     |
| idNumber     | 身分證號     |
| phone        | 旅客電話     |
| address      | 旅客地址     |
| salesName    | 業務員姓名   |
| signatureImgTag | 簽名圖片 |

---

## 2️⃣ 個別旅遊契約 (tpl_individual.ejs)

### 對應欄位 (defaultFieldsFor('individual'))
| 變數       | 說明   |
|------------|--------|
| itinerary  | 行程內容 |
| hotel      | 住宿資訊 |
| flightInfo | 航班資訊 |

### 通用欄位
| 變數         | 說明         |
|--------------|--------------|
| travelerName | 旅客姓名     |
| agentName    | 旅行社名稱   |
| createdAt    | 建立日期     |
| departureDate| 出發日期     |
| departureTime| 出發時間     |
| idNumber     | 身分證號     |
| phone        | 旅客電話     |
| address      | 旅客地址     |
| salesName    | 業務員姓名   |
| signatureImgTag | 簽名圖片 |

---

## 3️⃣ 機票交易須知 (tpl_flight.ejs)

### 對應欄位 (defaultFieldsFor('flight'))
| 變數              | 說明         |
|-------------------|--------------|
| airline           | 航空公司名稱 |
| flightNo          | 機票號碼     |
| ticketPrice       | 機票票價     |
| validFrom         | 使用起始日   |
| validTo           | 使用截止日   |
| expiryDate        | 機票到期日   |
| minStay           | 最短停留天數 |
| minStayType       | 停留依據 (出發/抵達/折返) |
| maxStay           | 最長停留天數 |
| segmentLimit      | 航段限制     |
| flightLimit       | 航班限制     |
| departureTimeLimit| 出發航班限制 |
| returnTimeLimit   | 回程航班限制 |
| otherLimit        | 其他限制     |
| changeAllowed     | 是否可更改   |
| changeFee         | 更改手續費   |
| changePriceDiff   | 更改是否需補價差 |
| refundAllowed     | 是否可退票   |
| refundAgency      | 退票單位     |
| refundReason      | 退票原因     |
| refundFee         | 退票手續費   |
| baggagePieces     | 行李件數     |
| baggageWeight     | 行李重量     |
| baggageOther      | 行李其他規定 |
| otherNotes        | 其他備註     |
| contactInfo       | 聯絡方式     |

### 通用欄位
| 變數         | 說明         |
|--------------|--------------|
| travelerName | 旅客姓名     |
| agentName    | 旅行社/售票單位 |
| createdAt    | 建立日期     |
| signatureImgTag | 簽名圖片 |

---

## 📌 注意事項
1. 所有模板使用 **EJS 語法**：  
   - `<%= var %>` → 插入並轉義  
   - `<%- var %>` → 插入 HTML (用於簽名圖片)  

2. `pdfService.js` 會依據合約類型自動選擇模板，例如：  
   ```js
   generatePdf('group', data);
   generatePdf('individual', data);
   generatePdf('flight', data);
