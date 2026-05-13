FROM node:26-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:26-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY docker-start.sh ./docker-start.sh

RUN mkdir -p uploads
RUN chmod +x ./docker-start.sh

EXPOSE 3001

CMD ["./docker-start.sh"]
