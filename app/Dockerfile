# syntax=docker/dockerfile:1

# ---- deps stage: install only production dependencies -----------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# ---- build/test stage: install everything, run lint/tests -------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run lint && npm test

# ---- runtime stage: minimal image, non-root user -----------------------
FROM node:20-alpine AS runtime
WORKDIR /app

# Configurable at runtime via env vars / ConfigMap / Secret, never baked in.
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info \
    APP_NAME=devops-azure-api

# Alpine already ships a non-root "node" user (uid 1000); reuse it instead
# of creating a new one to keep the image small.
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package*.json ./

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
