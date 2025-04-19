FROM node:22-alpine AS builder

WORKDIR /app

# Copy package.json files for workspace setup
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/typescript-config/ ./packages/typescript-config/
COPY packages/eslint-config/ ./packages/eslint-config/
COPY apps/controller/ ./apps/controller/

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Build the controller
RUN pnpm --filter "@auxbot/controller" build

# Production image
FROM node:22-alpine AS runner

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/apps/controller/dist ./dist
COPY --from=builder /app/apps/controller/package.json ./

# Install production dependencies only
RUN npm install -g pnpm
RUN pnpm install --prod

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]