# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# better-sqlite3 falls back to compiling from source when no prebuilt binary
# matches (e.g. some ARM/musl combos on a Raspberry Pi).
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
# SQL migrations are applied on boot, so they must ship with the image.
COPY --from=builder /app/drizzle ./drizzle

# data/ holds the SQLite DB + photos; mounted as a volume in docker-compose.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

ENV PORT=3000
ENV DATABASE_PATH=/app/data/chores.db
# Photo-proof uploads come through form posts; the adapter default (512kb)
# would reject phone photos.
ENV BODY_SIZE_LIMIT=10M
EXPOSE 3000

CMD ["node", "build"]
