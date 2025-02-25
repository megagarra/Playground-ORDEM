import axios from 'axios';
import qrcode from 'qrcode';
import { Client as WhatsAppClient, Message, LocalAuth } from '@periskope/whatsapp-web.js';
import EventEmitter from 'events';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { ReadStream } from 'fs';
import OpenAI from 'openai';
import config from './config';

// ✨ Importa do arquivo de banco (Thread e agora ThreadMessage)
import { Thread, ThreadMessage, IThreadModel } from './database';

dotenv.config();

/******************************************************************************
 * 1) Cria o client do OpenAI
 *****************************************************************************/
export const openai = new OpenAI({ apiKey: config.openAIAPIKey });

/******************************************************************************
 * 2) Função de transcrição de áudio (salva em .mp3, chama Whisper)
 *****************************************************************************/
export async function transcribeAudio(base64Audio: string): Promise<string> {
  try {
    const tempFilePath = path.join(__dirname, 'tempAudio.mp3');
    const buffer = Buffer.from(base64Audio, 'base64');
    fs.writeFileSync(tempFilePath, buffer);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1'
      // language: 'pt', // descomente se quiser forçar PT-BR
    });

    fs.unlinkSync(tempFilePath);
    return transcription.text;
  } catch (error: any) {
    console.error('Erro ao transcrever áudio:', error.message);
    return '[áudio não compreendido]';
  }
}

/******************************************************************************
 * 3) Localiza ou cria Thread no "banco" e também na OpenAI com cache em memória
 *****************************************************************************/
// Cache em memória para armazenar threads e evitar consultas repetidas
const threadCache = new Map<string, IThreadModel>();

async function findThreadByIdentifier(identifier: string): Promise<IThreadModel | null> {
  return Thread.findOne({ where: { identifier } });
}

async function createThreadInDB(data: {
  identifier: string;
  openai_thread_id: string;
  medium?: string;
}): Promise<IThreadModel> {
  return Thread.create(data);
}

/**
 * Retorna o próprio objeto Thread (com .id e .openai_thread_id)
 */
export async function findOrCreateThread(identifier: string, meta?: any): Promise<IThreadModel> {
  // 1. Verifica se a thread já está no cache
  if (threadCache.has(identifier)) {
    console.log('Thread encontrada no cache:', threadCache.get(identifier)?.openai_thread_id);
    return threadCache.get(identifier)!;
  }

  // 2. Tenta achar no banco de dados
  const existing = await findThreadByIdentifier(identifier);
  if (existing) {
    threadCache.set(identifier, existing);
    console.log('Thread encontrada no banco e adicionada ao cache:', existing.openai_thread_id);
    return existing;
  }

  // 3. Cria a thread na OpenAI
  const openaiThread = await openai.beta.threads.create({
    metadata: { identifier, medium: 'whatsapp', ...meta }
  });

  // 4. Salva a nova thread no banco
  const newThread = await createThreadInDB({
    identifier,
    openai_thread_id: openaiThread.id,
    medium: 'whatsapp'
  });

  // 5. Armazena a nova thread no cache
  threadCache.set(identifier, newThread);
  console.log('Nova thread criada e adicionada ao cache:', newThread.get());

  return newThread;
}

/******************************************************************************
 * 4) assistantResponse: envia prompt ao Thread, cria 'run' e faz polling
 * Agora passamos a "threadId" (openAI) e "dbThreadId" (ID local no BD)
 *****************************************************************************/
// Função principal que dispara a mensagem ao assistente e retorna a resposta
export async function assistantResponse(
  threadId: string,           // ID da thread na OpenAI
  prompt: string,
  tools: any[] = [],
  callback?: (run: any) => Promise<any>
): Promise<string> {
  // Verifica se existe run pendente
  const runs = await openai.beta.threads.runs.list(threadId);
  if (runs?.data?.length > 0) {
    const lastRun = runs.data[runs.data.length - 1];
    if (lastRun.status === 'in_progress' || lastRun.status === 'queued') {
      console.log('Aguardando run anterior finalizar:', lastRun.id, lastRun.status, threadId);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return assistantResponse(threadId, prompt, tools, callback);
    }
  }

  // Cria mensagem do usuário (no endpoint da OpenAI)
  await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: prompt
  });

  // Cria run
  const run = await openai.beta.threads.runs.create(threadId, {
    tools,
    tool_choice: 'auto',
    assistant_id: config.assistantId || 'asst_NnOLt2VjnIcdUe3ex8jDsTIU',
    additional_instructions: `
      Você está conversando via WhatsApp, responda de forma natural e direta.
      Ocasionalmente use emojis para se comunicar.
      Se tiver tools disponíveis, faça análise de sentimento da mensagem do usuário 
      e reaja com um emoji apropriado.
    `
  });

  let currentRun = await openai.beta.threads.runs.retrieve(threadId, run.id);

  // Loop de polling até terminar
  while (['queued', 'in_progress', 'requires_action'].includes(currentRun.status)) {
    if (currentRun.status === 'requires_action' && callback) {
      // Se a IA solicitou tools, executamos
      const outputs = await callback(currentRun);
      await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
        tool_outputs:
          outputs?.map((o: any) => ({
            tool_call_id: o.id,
            output: JSON.stringify(o.output)
          })) || []
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    currentRun = await openai.beta.threads.runs.retrieve(threadId, run.id);
  }

  // Pega a última mensagem do assistant
  const messages = await openai.beta.threads.messages.list(threadId);
  const lastAssistantMsg = messages.data
    .filter((m: any) => m.run_id === run.id && m.role === 'assistant')
    .pop();

  if (
    lastAssistantMsg &&
    lastAssistantMsg.content &&
    lastAssistantMsg.content[0]?.text?.value
  ) {
    return lastAssistantMsg.content[0].text.value;
  }

  return 'Não foi possível obter a resposta do assistente.';
}

/******************************************************************************
 * 5) Inicializa o bot do WhatsApp e configura o listener de mensagens
 *****************************************************************************/
const qrEmitter = new EventEmitter();
export { qrEmitter };

export const start = async () => {
  console.log('⏳ Inicializando cliente do WhatsApp...');

  const client = new WhatsAppClient({
    puppeteer: { args: ['--no-sandbox'] },
    authStrategy: new LocalAuth({ dataPath: path.join(process.cwd(), 'session') }),
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
  });

  client.on('qr', (qr: string) => {
    qrEmitter.emit('qr', qr);
    qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
      if (err) {
        console.error('Erro ao converter QR code:', err);
        return;
      }
      console.log(url); // Imprime o QR code em ASCII no terminal
    });
  });

  client.on('authenticated', () => {
    console.log('Cliente WhatsApp autenticado.');
    console.log('✅ Autenticado com sucesso!');
  });

  client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação do WhatsApp:', msg);
    console.log('❌ Falha na autenticação!');
  });

  client.on('ready', async () => {
    console.log('Cliente WhatsApp pronto.');
    console.log('✅ Bot pronto para receber mensagens!');
  });

  client.on('message', async (message: Message) => {
    try {
      if (message.fromMe) {
        console.log('Mensagem ignorada (enviada pelo próprio bot).');
        return;
      }

      const chat = await message.getChat();
      await chat.sendStateTyping();

      let userMessage: string;

      // Se for áudio/ptt, realiza a transcrição
      if (message.type === 'ptt' || message.type === 'audio') {
        if (!message.hasMedia) {
          throw new Error('Mensagem de áudio sem mídia disponível.');
        }
        console.log('Recebido áudio. Iniciando transcrição...');
        const media = await message.downloadMedia(); // base64
        userMessage = await transcribeAudio(media.data);
        console.log('Texto transcrito:', userMessage);
      } else {
        userMessage = message.body.trim();
      }

      // Localiza ou cria a thread para esse contato (retorna o objeto do BD)
      const dbThread = await findOrCreateThread(message.from);

      // 1) Salva mensagem do usuário no BD
      await ThreadMessage.create({
        thread_id: dbThread.id!, // "!": assumimos que 'id' existe
        role: 'user',
        content: userMessage
      });

      // 2) Envia ao assistente (OpenAI) e aguarda a resposta
      const response = await assistantResponse(dbThread.openai_thread_id, userMessage);
      console.log('Resposta do assistente:', response);

      // 3) Salva resposta do assistente no BD
      await ThreadMessage.create({
        thread_id: dbThread.id!,
        role: 'assistant',
        content: response
      });

      // 4) Envia de volta no WhatsApp
      await message.reply(response || '[sem resposta do assistant]');
      console.log('Mensagem enviada ao usuário.');

      await chat.clearState();
    } catch (error) {
      console.error('Erro ao processar a mensagem:', error);
      const chat = await message.getChat();
      await chat.clearState();
      await message.reply('❌ Ocorreu um erro ao processar sua mensagem. Tente novamente mais tarde.');
    }
  });

  client.initialize();
};
