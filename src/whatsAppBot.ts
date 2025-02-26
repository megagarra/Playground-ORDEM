import axios from 'axios';
import qrcode from 'qrcode';
import { Client as WhatsAppClient, Message, LocalAuth, Chat } from '@periskope/whatsapp-web.js';
import EventEmitter from 'events';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import config from './config';
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
    });

    fs.unlinkSync(tempFilePath);
    return transcription.text;
  } catch (error: any) {
    console.error('Erro ao transcrever áudio:', error.message);
    return '[áudio não compreendido]';
  }
}

/******************************************************************************
 * 3) Função para análise de arquivos (TXT, PDF e Imagens)
 *****************************************************************************/
interface ProcessResult {
  recognizedText: boolean;
  text: string;
  labels: string[];
}

async function processImageWithVision(media: any): Promise<ProcessResult> {
  const mime = media.mimetype || '';
  const dataUrl = `data:${mime};base64,${media.data}`;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Faça uma análise completa da imagem ou arquivo, não perca nenhum detalhe e forneça o detalhamento." },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      max_tokens: 300,
    });
    const answer = response.choices[0].message.content;
    return {
      recognizedText: answer && answer.trim().length > 0,
      text: answer,
      labels: []
    };
  } catch (error) {
    console.error("Erro ao analisar imagem com OpenAI:", error);
    return { recognizedText: false, text: "[erro ao analisar a imagem com OpenAI]", labels: [] };
  }
}

async function processFileAttachment(media: any): Promise<ProcessResult> {
  const mime = media.mimetype || '';
  if (mime.includes('text/plain')) {
    try {
      const text = Buffer.from(media.data, 'base64').toString('utf-8').trim();
      return { recognizedText: text.length > 0, text: text || '[arquivo TXT vazio]', labels: [] };
    } catch (error) {
      console.error('Erro ao processar arquivo TXT:', error);
      return { recognizedText: false, text: '[erro ao ler arquivo TXT]', labels: [] };
    }
  } else if (mime.includes('pdf')) {
    try {
      const pdfParse = require('pdf-parse');
      const buffer = Buffer.from(media.data, 'base64');
      const data = await pdfParse(buffer);
      const text = data.text.trim();
      return { recognizedText: text.length > 10, text: text || '[PDF sem texto reconhecível]', labels: [] };
    } catch (error) {
      console.error('Erro ao processar PDF:', error);
      return { recognizedText: false, text: '[erro ao extrair texto do PDF]', labels: [] };
    }
  } else if (mime.includes('image')) {
    return await processImageWithVision(media);
  } else {
    return { recognizedText: false, text: '[arquivo não suportado para extração de conteúdo]', labels: [] };
  }
}

/******************************************************************************
 * 4) Localiza ou cria Thread no "banco" e também na OpenAI, usando cache local
 *****************************************************************************/
const threadCache = new Map<string, IThreadModel>();

async function findThreadByIdentifier(identifier: string): Promise<IThreadModel | null> {
  return Thread.findOne({ where: { identifier } });
}

async function createThreadInDB(data: { identifier: string; openai_thread_id: string; medium?: string; }): Promise<IThreadModel> {
  return Thread.create(data);
}

export async function findOrCreateThread(identifier: string, meta?: any): Promise<IThreadModel> {
  if (threadCache.has(identifier)) {
    console.log('Thread encontrada no cache:', threadCache.get(identifier)?.openai_thread_id);
    return threadCache.get(identifier)!;
  }
  const existing = await findThreadByIdentifier(identifier);
  if (existing) {
    threadCache.set(identifier, existing);
    console.log('Thread encontrada no banco e adicionada ao cache:', existing.openai_thread_id);
    return existing;
  }
  const openaiThread = await openai.beta.threads.create({
    metadata: { identifier, medium: 'whatsapp', ...meta }
  });
  const newThread = await createThreadInDB({
    identifier,
    openai_thread_id: openaiThread.id,
    medium: 'whatsapp'
  });
  threadCache.set(identifier, newThread);
  console.log('Nova thread criada e adicionada ao cache:', newThread.get());
  return newThread;
}

/******************************************************************************
 * 5) assistantResponse: envia prompt ao Thread, cria 'run' e faz polling
 *****************************************************************************/
export async function assistantResponse(
  threadId: string,
  prompt: string,
  tools: any[] = [],
  callback?: (run: any) => Promise<any>
): Promise<string> {
  const runs = await openai.beta.threads.runs.list(threadId);
  if (runs?.data?.length > 0) {
    const lastRun = runs.data[runs.data.length - 1];
    if (lastRun.status === 'in_progress' || lastRun.status === 'queued') {
      console.log('Aguardando run anterior finalizar:', lastRun.id, lastRun.status, threadId);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return assistantResponse(threadId, prompt, tools, callback);
    }
  }
  await openai.beta.threads.messages.create(threadId, { role: 'user', content: prompt });
  const run = await openai.beta.threads.runs.create(threadId, {
    tools: [],
    tool_choice: 'none',
    assistant_id: config.assistantId || 'asst_NnOLt2VjnIcdUe3ex8jDsTIU',
    additional_instructions: `
      Você está conversando via WhatsApp, responda de forma natural e direta.
      Ocasionalmente use emojis para se comunicar.
    `
  });
  let currentRun = await openai.beta.threads.runs.retrieve(threadId, run.id);
  while (['queued', 'in_progress', 'requires_action'].includes(currentRun.status)) {
    if (currentRun.status === 'requires_action' && callback) {
      const outputs = await callback(currentRun);
      await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
        tool_outputs: outputs?.map((o: any) => ({
          tool_call_id: o.id,
          output: JSON.stringify(o.output)
        })) || []
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    currentRun = await openai.beta.threads.runs.retrieve(threadId, run.id);
  }
  const messages = await openai.beta.threads.messages.list(threadId);
  const lastAssistantMsg = messages.data
    .filter((m: any) => m.run_id === run.id && m.role === 'assistant')
    .pop();
  if (lastAssistantMsg && lastAssistantMsg.content && lastAssistantMsg.content[0]?.text?.value) {
    return lastAssistantMsg.content[0].text.value;
  }
  return 'Não foi possível obter a resposta do assistente.';
}

/******************************************************************************
 * Redis - Configuração do cliente para fila de mensagens
 *****************************************************************************/
import { createClient as createRedisClient } from 'redis';

const redisClient = createRedisClient({ url: process.env.REDIS_URL });
redisClient.connect().then(() => console.log('Conectado ao Redis.')).catch(console.error);

/******************************************************************************
 * Fila de mensagens: cada mensagem é enfileirada com dados:
 * { threadId, role, content }
 *****************************************************************************/
interface QueueMessage {
  threadId: number;
  role: string;
  content: string;
}

const QUEUE_KEY = 'fila_mensagens';

async function enqueueMessage(message: QueueMessage) {
  await redisClient.rPush(QUEUE_KEY, JSON.stringify(message));
}

/******************************************************************************
 * Lógica de Debounce para agrupar mensagens de texto fragmentadas
 *****************************************************************************/
interface Aggregator {
  aggregatedText: string;
  timer: NodeJS.Timeout;
  chat: Chat;
}
const messageAggregators: Map<string, Aggregator> = new Map();
const DEBOUNCE_DELAY = 3000; // 5 segundos

async function processAggregatedMessage(sender: string, aggregator: Aggregator) {
  try {
    const dbThread = await findOrCreateThread(sender);
    if (dbThread.paused) {
      console.log(`Conversa com ${sender} está pausada. Ignorando mensagens agregadas.`);
      return;
    }
    // Enfileira a mensagem agregada
    await enqueueMessage({ threadId: dbThread.id!, role: 'user', content: aggregator.aggregatedText });
    const response = await assistantResponse(dbThread.openai_thread_id, aggregator.aggregatedText);
    console.log('Resposta do assistente (agrupada):', response);
    // Enfileira a resposta do assistente
    await enqueueMessage({ threadId: dbThread.id!, role: 'assistant', content: response });
    // Envia a resposta para o chat
    await aggregator.chat.sendMessage(response || '[sem resposta do assistant]');
    console.log('Resposta agregada enviada ao usuário.');
  } catch (error) {
    console.error("Erro ao processar mensagem agregada:", error);
  }
}

/******************************************************************************
 * 6) Inicializa o bot do WhatsApp e configura o listener de mensagens
 *****************************************************************************/
const qrEmitter = new EventEmitter();
export { qrEmitter };

export const start = async () => {
  console.log('⏳ Inicializando cliente do WhatsApp...');
  const client = new WhatsAppClient({
    puppeteer: {
      args: ['--no-sandbox'],
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    },
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
      console.log(url);
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
      // Se a mensagem tiver mídia, processa imediatamente
      if (message.hasMedia) {
        // Processa mídia (audio, imagem, etc.) de forma imediata
        const dbThread = await findOrCreateThread(message.from);
        if (dbThread.paused) {
          console.log(`Conversa com ${message.from} está pausada. Ignorando mensagem.`);
          return;
        }
        const chat = await message.getChat();
        await chat.sendStateTyping();
        let userMessage: string;
        const media = await message.downloadMedia();
        if (message.type === 'ptt' || message.type === 'audio') {
          console.log('Recebido áudio. Iniciando transcrição...');
          userMessage = await transcribeAudio(media.data);
          console.log('Texto transcrito:', userMessage);
        } else {
          console.log('Recebido arquivo. Iniciando análise...');
          const result = await processFileAttachment(media);
          let finalMessage = '';
          if (result.recognizedText) {
            finalMessage += `Conteúdo analisado:\n${result.text}\n\n`;
          } else {
            finalMessage += `Não foi possível extrair ou reconhecer conteúdo significativo na imagem. Detalhes: ${result.text}\n\n`;
          }
          userMessage = finalMessage;
          console.log('Resultado do processamento do arquivo:', userMessage);
        }
        // Enfileira e responde imediatamente para mídia
        await enqueueMessage({ threadId: dbThread.id!, role: 'user', content: userMessage });
        const response = await assistantResponse(dbThread.openai_thread_id, userMessage);
        console.log('Resposta do assistente:', response);
        await enqueueMessage({ threadId: dbThread.id!, role: 'assistant', content: response });
        await message.reply(response || '[sem resposta do assistant]');
        console.log('Mensagem enviada ao usuário.');
        await (await message.getChat()).clearState();
        return;
      }
      
      // Para mensagens de texto, implementa a lógica de debounce
      const sender = message.from;
      const chat = await message.getChat();
      const text = message.body.trim();
      if (!text) return;
      
      if (messageAggregators.has(sender)) {
        // Se já existe um agregador para esse remetente, acumula o texto e reinicia o timer
        const aggregator = messageAggregators.get(sender)!;
        aggregator.aggregatedText += " " + text;
        clearTimeout(aggregator.timer);
        aggregator.timer = setTimeout(() => {
          processAggregatedMessage(sender, aggregator);
          messageAggregators.delete(sender);
        }, DEBOUNCE_DELAY);
      } else {
        // Cria um novo agregador para esse remetente
        const aggregator: Aggregator = {
          aggregatedText: text,
          chat,
          timer: setTimeout(() => {
            processAggregatedMessage(sender, aggregator);
            messageAggregators.delete(sender);
          }, DEBOUNCE_DELAY)
        };
        messageAggregators.set(sender, aggregator);
      }
    } catch (error) {
      console.error('Erro ao processar a mensagem:', error);
      const chat = await message.getChat();
      await chat.clearState();
      await message.reply('❌ Ocorreu um erro ao processar sua mensagem. Tente novamente mais tarde.');
    }
  });
  
  client.initialize();
};
