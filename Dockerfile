FROM node:20-slim

WORKDIR /app

# 依存パッケージインストール（キャッシュ効率化）
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# アプリケーションコピー
COPY . .

# Cloud Runは環境変数PORTで指定する
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
