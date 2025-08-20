FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM joseluisq/static-web-server:2
COPY --from=builder /app/dist /public
EXPOSE 80
CMD ["--port", "80", "--page-fallback", "/index.html"]