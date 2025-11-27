# 使用官方 Node.js 18 (或更新版本) 作為基礎映像
FROM node:18-alpine

# 設定工作目錄
WORKDIR /usr/src/app

# 複製 package.json 和 package-lock.json (如果存在)
COPY package*.json ./

# 安裝專案依賴
RUN npm install

# 複製所有程式碼到工作目錄
COPY . .

# Cloud Run 會將 $PORT 環境變數傳遞給容器，但我們必須在 Dockerfile 中暴露一個 PORT 
# (Express 程式碼中會使用 process.env.PORT)
EXPOSE 8080

# 容器啟動時執行的指令
# Cloud Run 預設會執行這個 CMD
CMD [ "npm", "start" ]