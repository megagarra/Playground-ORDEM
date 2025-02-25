import { Sequelize, DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import dotenv from 'dotenv';

// Carrega variáveis de ambiente do .env
dotenv.config();

// Configuração do banco de dados
const db = new Sequelize(process.env.DB_SCHEMA || 'postgres', process.env.DB_USER || 'postgres', process.env.DB_PASSWORD || 'postgres', {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    dialectOptions: {
        ssl: process.env.DB_SSL === 'true'
    },
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    logging: console.log // Exibe logs de queries (opcional)
});

// Interface para o modelo Thread
interface Thread extends Model<InferAttributes<Thread>, InferCreationAttributes<Thread>> {
    medium: string;
    identifier: string;
    openai_thread_id: string;
    createdAt: Date;
    updatedAt: Date;
}

// Definição do modelo Thread
export const Thread = db.define<Thread>('thread', {
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
        field: 'createdat' // Garante compatibilidade com PostgreSQL
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updatedat'
    }
}, {
    tableName: 'threads',
    timestamps: true
});

// Função para inicializar e criar a tabela caso não exista
const initializeDatabase = async () => {
    try {
        await db.authenticate();
        console.log('✅ Conectado ao banco de dados.');

        // Criando a tabela se não existir
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

        console.log('✅ Tabela "threads" verificada/criada com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao conectar/criar tabela:', error);
    }
};

// Executa a inicialização do banco
initializeDatabase();

export default db;
