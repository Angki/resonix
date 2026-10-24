# ==============================================================================
# Resonix - Enterprise Multi-Stage Dockerfile
# Production-ready, secure, lightweight Node.js 20 Alpine container
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Builder
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install native compilation dependencies for Prisma and build tools
RUN apk add --no-cache python3 make g++

# Copy workspace package manifests
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install dependencies for all workspaces
RUN npm ci

# Copy database schema and generate Prisma client
COPY server/prisma ./server/prisma
RUN npm run db:generate

# Copy source code
COPY scripts ./scripts
COPY client ./client
COPY server ./server

# Build production bundle (Client Vite -> Server static public -> Server TypeScript)
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runner
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

LABEL org.opencontainers.image.title="Resonix" \
      org.opencontainers.image.description="Enterprise Audiophile Streaming Server & Precision Studio Player" \
      org.opencontainers.image.url="https://github.com/Angki/resonix" \
      org.opencontainers.image.source="https://github.com/Angki/resonix" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Install runtime dependencies: FFmpeg (transcoding), curl (healthcheck), sqlite (backups)
RUN apk add --no-cache ffmpeg curl dumb-init sqlite

# Set production environment
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    APP_BASE_URL=http://localhost:3000 \
    DATABASE_URL=file:/data/library.db \
    LIBRARY_ROOTS_JSON='["/music"]' \
    PLAYLIST_IMPORT_PATH=/data/playlists

# Copy package files for production dependency installation
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy generated Prisma client from builder
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/server/src/generated ./server/src/generated

# Copy compiled backend and frontend distribution
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/public ./server/public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/server/docker-entrypoint.sh ./server/docker-entrypoint.sh
RUN chmod +x ./server/docker-entrypoint.sh

# Create persistent storage directories and assign permissions to non-root node user
RUN mkdir -p /data /music /app/cache /app/data && \
    chown -R node:node /app /data

# Expose server HTTP port
EXPOSE 3000

# Docker volume declarations
VOLUME ["/music", "/data"]

# Readiness probe: verifies the database is migrated and reachable
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/api/ready || exit 1

# Switch to unprivileged non-root user
USER node

# Use dumb-init for proper PID 1 signal forwarding and zombie reaper
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/app/server/docker-entrypoint.sh"]

CMD ["node", "server/dist/index.js"]
