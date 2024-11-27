# Use a imagem base de Node.js
FROM node:18

# Instala as dependências do sistema necessárias para o Puppeteer/Chromium
RUN apt-get update && apt-get install -y \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libdrm2 \
    libgbm-dev

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copia os arquivos de dependências
COPY package.json yarn.lock ./

# Instala as dependências do projeto
RUN yarn install

# Copia todo o código do projeto para o contêiner
COPY . .

# Expõe a porta
EXPOSE 8080

# Comando para iniciar a aplicação
CMD ["yarn", "dev"]