# Imagen para Railway, Fly.io o cualquier host de contenedores.
FROM node:24-slim

WORKDIR /app

# Dependencias (se copian primero los package.json para aprovechar la caché de capas)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
