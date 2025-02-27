import { Sequelize, DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Substitua pela sua URL ou use .env (DATABASE_URL=...):
const DB_URL =
  process.env.DATABASE_URL ||
  '';

// Cria a conexão usando a Connection String completa
export const db = new Sequelize(DB_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // Important for Railway
    },
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  logging: false // Disable logging in production
});

/******************************************************************************
 * MODELO Thread (já existente) - agora com flag "paused"
 *****************************************************************************/
export interface IThreadModel
  extends Model<InferAttributes<IThreadModel>, InferCreationAttributes<IThreadModel>> {
  id?: number;
  medium: string;
  identifier: string;
  openai_thread_id: string;
  paused: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const Thread = db.define<IThreadModel>('thread', {
  medium: {
    type: DataTypes.STRING,
    allowNull: false
  },
  identifier: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  openai_thread_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  paused: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'createdat',
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updatedat',
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'threads',
  timestamps: true
});

/******************************************************************************
 * MODELO ThreadMessage (novo)
 *****************************************************************************/
export interface IThreadMessageModel
  extends Model<InferAttributes<IThreadMessageModel>, InferCreationAttributes<IThreadMessageModel>> {
  id?: number;
  thread_id: number;       // referência ao ID da thread
  role: string;            // 'user' ou 'assistant'
  content: string;         // mensagem de texto
  createdAt?: Date;
  updatedAt?: Date;
}

export const ThreadMessage = db.define<IThreadMessageModel>('thread_message', {
  thread_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'createdat',
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updatedat',
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'thread_messages',
  timestamps: true
});

/******************************************************************************
 * MODELO Config (novo) - para armazenar configurações do sistema
 *****************************************************************************/
export interface IConfigModel
  extends Model<InferAttributes<IConfigModel>, InferCreationAttributes<IConfigModel>> {
  id?: number;
  key: string;             // chave da configuração (ex: "OPENAI_API_KEY")
  value: string;           // valor da configuração
  description?: string;    // descrição opcional
  createdAt?: Date;
  updatedAt?: Date;
}

export const Config = db.define<IConfigModel>('config', {
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'createdat',
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updatedat',
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'configs',
  timestamps: true
});

// Métodos para gerenciar configurações
export async function getConfig(key: string): Promise<string | null> {
  const config = await Config.findOne({ where: { key } });
  return config ? config.value : null;
}

export async function getAllConfigs(): Promise<Record<string, string>> {
  const configs = await Config.findAll();
  return configs.reduce((acc, config) => {
    acc[config.key] = config.value;
    return acc;
  }, {} as Record<string, string>);
}

export async function setConfig(key: string, value: string, description?: string): Promise<IConfigModel> {
  const [config, created] = await Config.findOrCreate({
    where: { key },
    defaults: { key, value, description }
  });
  
  if (!created) {
    config.value = value;
    if (description) config.description = description;
    await config.save();
  }
  
  return config;
}

// Cache em memória para configurações
let configCache: Record<string, string> = {};
let cacheInitialized = false;

// Atualiza o cache com as configurações do banco
export async function refreshConfigCache(): Promise<Record<string, string>> {
  try {
    configCache = await getAllConfigs();
    cacheInitialized = true;
    console.log('✅ Cache de configurações atualizado.');
    return configCache;
  } catch (error) {
    console.error('❌ Erro ao atualizar cache de configurações:', error);
    return configCache;
  }
}

// Obtém uma configuração (primeiro do cache, depois do banco se necessário)
export async function getConfigCached(key: string): Promise<string | null> {
  if (!cacheInitialized) {
    await refreshConfigCache();
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

// Método para inicializar configurações padrão
export async function initializeDefaultConfigs(defaults: Record<string, { value: string, description: string }>) {
  for (const [key, { value, description }] of Object.entries(defaults)) {
    if (!value) continue; // Ignora valores vazios
    
    const existingConfig = await Config.findOne({ where: { key } });
    if (!existingConfig) {
      await Config.create({ key, value, description });
      console.log(`✅ Configuração padrão criada: ${key}`);
    }
  }
}

/******************************************************************************
 * Inicializa
 *****************************************************************************/
async function initializeDatabase() {
  try {
    await db.authenticate();
    console.log('✅ Conectado ao banco de dados.');

    // Cria a tabela threads se não existir (incluindo o campo "paused")
    await db.query(`
      CREATE TABLE IF NOT EXISTS threads (
        id SERIAL PRIMARY KEY,
        medium VARCHAR(255) NOT NULL,
        identifier VARCHAR(255) UNIQUE NOT NULL,
        openai_thread_id VARCHAR(255) NOT NULL,
        paused BOOLEAN NOT NULL DEFAULT false,
        createdat TIMESTAMP DEFAULT NOW(),
        updatedat TIMESTAMP DEFAULT NOW()
      );
    `);

    // Cria a tabela thread_messages se não existir
    await db.query(`
      CREATE TABLE IF NOT EXISTS thread_messages (
        id SERIAL PRIMARY KEY,
        thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        createdat TIMESTAMP DEFAULT NOW(),
        updatedat TIMESTAMP DEFAULT NOW()
      );
    `);

    // Cria a tabela configs se não existir
    await db.query(`
      CREATE TABLE IF NOT EXISTS configs (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        createdat TIMESTAMP DEFAULT NOW(),
        updatedat TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ Tabelas verificadas/criadas com sucesso.');
    
    // Inicializa configurações padrão do .env se tabela estiver vazia
    const configCount = await Config.count();
    if (configCount === 0) {
      console.log('A tabela de configurações está vazia. Inicializando com valores do .env...');
      
      await initializeDefaultConfigs({
        'OPENAI_API_KEY': { value: process.env.OPENAI_API_KEY || '', description: 'Chave de API da OpenAI' },
        'ASSISTANT_ID': { value: process.env.ASSISTANT_ID || '', description: 'ID do assistente na OpenAI' },
        'BOT_NAME': { value: process.env.BOT_NAME || 'Garra', description: 'Nome do bot' },
        'WHATSAPP_NUMBER': { value: process.env.WHATSAPP_NUMBER || '', description: 'Número do WhatsApp para o bot' },
        'DATABASE_URL': { value: process.env.DATABASE_URL || '', description: 'URL de conexão com o banco de dados' },
        'REDIS_URL': { value: process.env.REDIS_URL || '', description: 'URL de conexão com o Redis' }
      });
      
      // Carrega o cache inicial
      await refreshConfigCache();
    }
  } catch (error) {
    console.error('❌ Erro ao conectar/criar tabelas:', error);
  }
}

initializeDatabase();

export default db;