# Stage 1: Build client and server
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package manifests first for layer caching
COPY package.json ./
COPY server/package.json server/package-lock.json* ./server/
COPY client/package.json client/package-lock.json* ./client/

RUN npm --prefix server ci || npm --prefix server install
RUN npm --prefix client ci || npm --prefix client install

# Copy source and build
COPY server ./server
COPY client ./client

RUN npm --prefix server run build && npm --prefix client run build

# Stage 2: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY server/package.json server/package-lock.json* ./server/
RUN npm --prefix server ci --omit=dev || npm --prefix server install --omit=dev

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 8080
CMD ["node", "server/dist/index.js"]
