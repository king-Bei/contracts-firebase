# 使用官方 Node.js 18 (或更新版本) 作為基礎映像
FROM node:18-alpine

# 建立一個非 root 使用者 node 並建立 /home/node 目錄
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 設定工作目錄，並將擁有者設為 appuser
WORKDIR /usr/src/app
RUN chown -R appuser:appgroup /usr/src/app
USER appuser

# 複製 package.json 和 package-lock.json (如果存在)
COPY package*.json ./

# 安裝專案依賴 (僅限 production)
# 使用 npm ci 可以確保依賴版本與 package-lock.json 一致，安裝速度也更快
RUN npm ci --only=production

# 複製所有程式碼到工作目錄
# .dockerignore 檔案會確保不必要的檔案不會被複製進來
COPY . .

# Cloud Run 會將 $PORT 環境變數傳遞給容器，但我們必須在 Dockerfile 中暴露一個 PORT 
# (Express 程式碼中會使用 process.env.PORT)
# 雖然 Cloud Run 會覆寫，但 EXPOSE 是一個好的文件說明
EXPOSE 8080

# 容器啟動時執行的指令
# Cloud Run 預設會執行這個 CMD
CMD [ "npm", "start" ]