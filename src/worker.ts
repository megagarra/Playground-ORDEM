import { ThreadMessage } from './database';
import { createClient as createRedisClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = createRedisClient({ url: process.env.REDIS_URL });
redisClient.connect().then(() => console.log('Worker: Conectado ao Redis.')).catch(console.error);

const QUEUE_KEY = 'fila_mensagens';

interface QueueMessage {
  threadId: number;
  role: string;
  content: string;
}

async function processMessage(message: QueueMessage) {
  try {
    await ThreadMessage.create({
      thread_id: message.threadId,
      role: message.role,
      content: message.content
    });
    console.log(`Worker: Mensagem processada para thread ${message.threadId}.`);
  } catch (error) {
    console.error(`Worker: Erro ao processar mensagem para thread ${message.threadId}:`, error);
  }
}

async function workerLoop() {
  while (true) {
    try {
      // Utiliza BRPOP para aguardar até 5 segundos por uma mensagem
      const item = await redisClient.brPop(QUEUE_KEY, 5);
      if (item) {
        const message: QueueMessage = JSON.parse(item.element);
        await processMessage(message);
      }
    } catch (error) {
      console.error('Worker: Erro no loop:', error);
    }
  }
}

workerLoop();
