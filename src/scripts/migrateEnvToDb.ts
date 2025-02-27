// src/scripts/migrateEnvToDb.ts
import dotenv from 'dotenv';
import { db } from '../database';
import { initializeConfigTable, setConfig } from '../models/config';

dotenv.config();

// Lista de variáveis a serem migradas do .env para o banco de dados
const ENV_VARS_TO_MIGRATE = [
  { 
    key: 'OPENAI_API_KEY', 
    description: 'Chave da API da OpenAI' 
  },
  { 
    key: 'ASSISTANT_ID', 
    description: 'ID do Assistente na OpenAI' 
  },
  { 
    key: 'BOT_NAME', 
    description: 'Nome do Bot' 
  },
  { 
    key: 'DATABASE_URL', 
    description: 'URL de conexão com o banco de dados' 
  },
  { 
    key: 'REDIS_URL', 
    description: 'URL de conexão com o Redis' 
  },
  { 
    key: 'WHATSAPP_NUMBER', 
    description: 'Número do WhatsApp para o bot' 
  },
  { 
    key: 'API_BASE_URL', 
    description: 'URL base da API' 
  }
];

// Função para migrar as variáveis de ambiente para o banco de dados
async function migrateEnvToDb() {
  try {
    console.log('Iniciando migração de variáveis de ambiente para o banco de dados...');
    
    // Garante que a tabela de configurações existe
    await initializeConfigTable();
    
    // Migra cada variável de ambiente para o banco de dados
    for (const { key, description } of ENV_VARS_TO_MIGRATE) {
      const value = process.env[key];
      
      if (value) {
        await setConfig(key, value, description);
        console.log(`✅ Configuração '${key}' migrada com sucesso.`);
      } else {
        console.log(`⚠️ Variável '${key}' não encontrada no .env, pulando.`);
      }
    }
    
    console.log('✅ Migração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
  } finally {
    // Encerra a conexão com o banco de dados
    await db.close();
  }
}

// Executa a migração
migrateEnvToDb();