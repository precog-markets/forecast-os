FROM node:22-alpine AS deps
WORKDIR /app/mcp
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY . ./
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV FORECASTOS_MCP_PORT=3001
ENV FORECASTOS_MCP_PATH=/mcp
ENV FORECASTOS_RESOURCE_DIR=/app/mcp/resources
WORKDIR /app/mcp

COPY --from=build /app/mcp/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/mcp/dist ./dist
COPY resources ./resources

USER node
EXPOSE 3001
CMD ["node", "dist/http.js"]
