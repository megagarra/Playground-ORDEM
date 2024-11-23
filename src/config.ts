// src/config.js

import process from 'process';
import dotenv from 'dotenv';

// Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

// Validação das variáveis de ambiente
const requiredEnvVars = ['WHATSAPP_NUMBER', 'OPENAI_API_KEY', 'ASSISTANT_ID'];

requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Erro: A variável de ambiente ${varName} não está definida.`);
    process.exit(1);
  }
});

// Configuração utilizando as variáveis de ambiente
export const config = {
  whatsAppNumber: process.env.WHATSAPP_NUMBER,
  openAIAPIKey: process.env.OPENAI_API_KEY,
  assistantId: process.env.ASSISTANT_ID,
};

export default config;
