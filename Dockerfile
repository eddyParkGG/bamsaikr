# API 서버 (토스증권 허용 IP 때문에 고정 IP 한 대로 운영)
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm i --no-save tsx@4
COPY server ./server
COPY shared ./shared
COPY tsconfig.json tsconfig.node.json ./
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server/dev.ts"]
