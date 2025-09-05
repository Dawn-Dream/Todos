FROM node:24-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
COPY .env.docker ./.env.docker
RUN npm install --prefix backend --omit=dev
COPY backend/ ./backend/
EXPOSE 3000
CMD ["node", "backend/index.js"]