# Build stage
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Native deps for sharp + bcrypt-style modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Sharp needs libvips at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "node ./scripts/migrate.js && node build"]
