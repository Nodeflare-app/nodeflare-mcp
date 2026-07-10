# MCP server image for Glama / registry introspection checks and self-hosting.
# The server speaks MCP over stdio and registers all tools without any env vars
# (NODEFLARE_API_KEY / X402_PRIVATE_KEY are optional), so introspection
# (initialize + tools/list) succeeds out of the box.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
ENTRYPOINT ["node", "dist/index.js"]
