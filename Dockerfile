FROM node:18-slim

# Instalar herramientas de compilación necesarias para sqlite3 nativo
RUN apt-get update && apt-get install -y python3 make g++

WORKDIR /app

COPY package*.json ./

# Forzar la recompilación de los módulos nativos para este entorno Linux
RUN npm rebuild sqlite3 --build-from-source

RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]