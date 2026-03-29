FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Set up for Turborepo
FROM base AS builder
# Add libc6-compat for alpine compatibility
RUN apk update
RUN apk add --no-cache libc6-compat
# Set working directory
WORKDIR /app
RUN pnpm install -g turbo
COPY . .
RUN turbo prune @auxbot/worker --docker

# Install dependencies
FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat protobuf
WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
RUN pnpm install

# Build the project and its dependencies
COPY --from=builder /app/out/full/ .
RUN pnpm turbo build --filter=@auxbot/worker...

# Production image
FROM base AS runner
WORKDIR /app

# Install required dependencies
RUN apk add --no-cache python3 py3-pip ffmpeg

# Install yt-dlp with full YouTube support dependencies
RUN python3 -m pip install --no-cache-dir --break-system-packages "yt-dlp[default]"

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Create a dedicated temp directory for auxbot with proper permissions
RUN mkdir -p /tmp/auxbot
RUN chown -R nodejs:nodejs /tmp/auxbot

USER nodejs

COPY --from=installer /app .

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/usr/local/bin:$PATH"

CMD ["node", "apps/worker/dist/index.js"]
