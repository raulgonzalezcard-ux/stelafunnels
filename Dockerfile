FROM node:18-slim

# Instalar herramientas de compilación obligatorias para sqlite3
RUN apt-get update && apt-get install -y python3 make g++

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Forzar la instalación y compilación limpia de sqlite3 desde el código fuente
RUN npm install --production --build-from-source=sqlite3

# Copiar el resto del código fuente del proyecto
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]