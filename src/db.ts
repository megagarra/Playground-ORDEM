// db.js
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Função para inicializar o banco de dados (criação de tabelas)
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Tabela "conversations" verificada ou criada com sucesso.');
    } catch (error) {
        console.error('Erro ao inicializar o banco de dados:', error);
    } finally {
        client.release();
    }
}

export { pool, initializeDatabase };
