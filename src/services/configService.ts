// src/services/configService.ts
import { getAllConfigs, getConfig, setConfig, initializeConfigTable, initializeDefaultConfigs } from '../models/config';

// Cache em memória para configurações
let configCache: Record<string, string> = {};
let cacheInitialized = false;

// Configurações padrão para inicialização
const DEFAULT_CONFIGS = {
  'OPENAI_API_KEY': { 
    value: process.env.OPENAI_API_KEY || '', 
    description: 'Chave de API da OpenAI' 
  },
  'ASSISTANT_ID': { 
    value: process.env.ASSISTANT_ID || '', 
    description: 'ID do assistente na OpenAI' 
  },
  'BOT_NAME': { 
    value: process.env.BOT_NAME || 'Garra', 
    description: 'Nome do bot' 
  },
  'WHATSAPP_NUMBER': { 
    value: process.env.WHATSAPP_NUMBER || '', 
    description: 'Número do WhatsApp para o bot' 
  },
  'API_BASE_URL': { 
    value: process.env.API_BASE_URL || '', 
    description: 'URL base da API' 
  }
};

// Inicializa o serviço de configuração
export async function initializeConfigService() {
  try {
    // Cria tabela se não existir
    await initializeConfigTable();
    
    // Inicializa configurações padrão
    await initializeDefaultConfigs(DEFAULT_CONFIGS);
    
    // Carrega todas as configurações para o cache
    await refreshCache();
    
    console.log('✅ Serviço de configuração inicializado com sucesso.');
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de configuração:', error);
  }
}

// Atualiza o cache com os valores do banco de dados
export async function refreshCache() {
  try {
    configCache = await getAllConfigs();
    cacheInitialized = true;
    console.log('✅ Cache de configurações atualizado.');
  } catch (error) {
    console.error('❌ Erro ao atualizar cache de configurações:', error);
  }
}

// Obtém uma configuração (primeiro do cache, depois do banco se necessário)
export async function getConfigValue(key: string): Promise<string | null> {
  if (!cacheInitialized) {
    await refreshCache();
  }
  
  // Tenta buscar do cache primeiro
  if (key in configCache) {
    return configCache[key];
  }
  
  // Se não estiver no cache, busca do banco e atualiza o cache
  const value = await getConfig(key);
  if (value !== null) {
    configCache[key] = value;
  }
  
  return value;
}

// Define uma configuração e atualiza o cache
export async function setConfigValue(key: string, value: string, description?: string) {
  const result = await setConfig(key, value, description);
  
  // Atualiza o cache
  configCache[key] = value;
  
  return result;
}

// Obtém todas as configurações
export async function getAllConfigValues() {
  if (!cacheInitialized) {
    await refreshCache();
  }
  
  return { ...configCache };
}

// Cria um objeto de configuração semelhante ao módulo config atual
export async function getConfigObject() {
  const configs = await getAllConfigValues();
  
  return {
    openAIAPIKey: configs['OPENAI_API_KEY'] || '',
    assistantId: configs['ASSISTANT_ID'] || '',
    botName: configs['BOT_NAME'] || 'Garra',
    whatsAppNumber: configs['WHATSAPP_NUMBER'] || '',
    API_BASE_URL: configs['API_BASE_URL'] || '',
  };
}

export default {
  initializeConfigService,
  refreshCache,
  getConfigValue,
  setConfigValue,
  getAllConfigValues,
  getConfigObject
};