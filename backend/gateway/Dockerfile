
FROM node:22-alpine

WORKDIR /app

# Install shared backend dependencies, including ioredis
COPY package*.json ./
RUN npm install --omit=dev

# Install Gateway-specific dependencies
COPY gateway/package*.json ./gateway/
WORKDIR /app/gateway
RUN npm install --omit=dev

# Copy application source
WORKDIR /app
COPY gateway ./gateway
COPY shared ./shared

WORKDIR /app/gateway

EXPOSE 8000

CMD ["npm", "start"]
