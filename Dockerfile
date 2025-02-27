# Use a imagem base de Node.js
FROM node:18

# Instala as dependências do sistema necessárias para o Puppeteer/Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libgtk-3-0 \
    libasound2 \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    wget \
    ffmpeg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libgconf-2-4 \
    libnspr4 \
    libxss1 \
    xdg-utils

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copia os arquivos de dependências
COPY package.json yarn.lock ./

# Instala as dependências do projeto
RUN yarn install

# Copia todo o código do projeto para o contêiner
COPY . .

# Variáveis de ambiente para Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Expõe a porta
EXPOSE 8080

# Comando para iniciar a aplicação
CMD ["yarn", "start"]