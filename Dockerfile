# 使用 Debian-based Node.js 基礎映像，Puppeteer 在 Debian 上更容易安裝依賴
FROM node:18-bullseye-slim

# 安裝 Puppeteer 執行所在的 Chromium 依賴
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-freefont-ttf fonts-kacst fonts-thai-tlwg fonts-wqy-zenhei \
    libnss3 libatk-bridge1.0-0 libxcomposite1 libxrandr2 libxdamage1 libxkbcommon0 \
    libgbm1 libasound2 libpangocairo-1.0-0 libpango-1.0-0 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 設定環境變數讓 Puppeteer 使用系統安裝的 Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 建立並切換工作目錄
WORKDIR /usr/src/app

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝依賴 (僅限 production)
RUN npm ci --only=production

# 複製程式碼
COPY . .

# 設定非 root 使用者 (使用內建的 node 使用者)
RUN chown -R node:node /usr/src/app
USER node

# 暴露埠號
EXPOSE 8080

# 啟動應用程式
CMD [ "npm", "start" ]