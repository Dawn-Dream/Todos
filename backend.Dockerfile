FROM node:24-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
COPY .env.example ./.env.example
RUN npm install --prefix backend --omit=dev
COPY backend/ ./backend/
EXPOSE 3000
CMD ["node", "-r", "dotenv/config", "backend/index.js"]