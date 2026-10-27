
FROM node:22-alpine

WORKDIR /app

COPY gateway/package*.json ./gateway/

WORKDIR /app/gateway

RUN npm install

WORKDIR /app

COPY gateway ./gateway
COPY shared ./shared

WORKDIR /app/gateway

EXPOSE 8000

CMD ["npm", "start"]
