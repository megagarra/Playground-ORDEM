// database.ts
import { Sequelize, DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

// Substitua pela sua URL, ou use .env (DATABASE_URL=...):
const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:PHUFShGDHeMBZjDIEvvnIaPboExBifWS@gondola.proxy.rlwy.net:12251/railway';

// Cria a conexão usando a Connection String completa
export const db = new Sequelize(DB_URL, {
  dialect: 'postgres',
  // Se precisar de SSL no Railway, descomente:
  // dialectOptions: {
  //   ssl: {
  //     require: true,
  //     rejectUnauthorized: false,
  //   },
  // },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  logging: console.log
});

/******************************************************************************
 * MODELO Thread (já existente)
 ******************************************************************************/
export interface IThreadModel
  extends Model<InferAttributes<IThreadModel>, InferCreationAttributes<IThreadModel>> {
  id?: number;
  medium: string;
  identifier: string;
  openai_thread_id: string;
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
 ******************************************************************************/
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
 * Inicializa
 ******************************************************************************/
async function initializeDatabase() {
  try {
    await db.authenticate();
    console.log('✅ Conectado ao banco de dados.');

    // Cria a tabela threads se não existir
    await db.query(`
      CREATE TABLE IF NOT EXISTS threads (
        id SERIAL PRIMARY KEY,
        medium VARCHAR(255) NOT NULL,
        identifier VARCHAR(255) UNIQUE NOT NULL,
        openai_thread_id VARCHAR(255) NOT NULL,
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

    console.log('✅ Tabelas verificadas/criadas com sucesso.');
  } catch (error) {
    console.error('❌ Erro ao conectar/criar tabelas:', error);
  }
}

initializeDatabase();

export default db;
