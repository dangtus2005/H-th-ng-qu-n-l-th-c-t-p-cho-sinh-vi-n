FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY backend ./backend
COPY frontend ./frontend
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/migrations ./backend/migrations
COPY backend/scripts/migrate.cjs ./backend/scripts/migrate.cjs
COPY backend/package.json ./backend/package.json
COPY frontend ./frontend
RUN mkdir -p /app/backend/uploads/templates && chown -R node:node /app
USER node
EXPOSE 8000
CMD ["node", "backend/dist/server.js"]
