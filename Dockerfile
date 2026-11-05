# API server (runs as a single static-IP machine because of the Toss Securities IP allowlist)
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
