import axios from 'axios';
import qrcode from 'qrcode';
import { Client as WhatsAppClient, Message, LocalAuth } from '@periskope/whatsapp-web.js';
import EventEmitter from 'events';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import config from './config';

// ✨ Importa do arquivo de banco (Thread e ThreadMessage)
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
 * 3) Função para análise de arquivos (TXT, PDF e Imagens)
 *****************************************************************************/
// Define um tipo para o resultado do processamento do arquivo
interface ProcessResult {
  recognizedText: boolean;  // indica se algum conteúdo foi reconhecido
  text: string;             // texto ou descrição extraída
  labels: string[];         // lista de labels (caso use outro método)
}

// Função para usar a visão da OpenAI para analisar imagens
async function processImageWithVision(media: any): Promise<ProcessResult> {
  const mime = media.mimetype || '';
  // Cria uma URL de dados com o conteúdo da imagem
  const dataUrl = `data:${mime};base64,${media.data}`;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // modelo com visão habilitada
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analise esta imagem e descreva o que há nela, identificando pessoas, animais, objetos e outros detalhes importantes, e fale para o usuario o que tem na imagem de forma resumida" },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      max_tokens: 300,
    });
    const answer = response.choices[0].message.content;
    return {
      recognizedText: !!(answer && answer.trim().length > 0),
      text: answer || "",
      labels: [] // opcional
    };
  } catch (error) {
    console.error("Erro ao analisar imagem com OpenAI:", error);
    return { recognizedText: false, text: "[erro ao analisar a imagem com OpenAI]", labels: [] };
  }
}

async function processFileAttachment(media: any): Promise<ProcessResult> {
  const mime = media.mimetype || '';

  // TXT
  if (mime.includes('text/plain')) {
    try {
      const text = Buffer.from(media.data, 'base64').toString('utf-8').trim();
      return { recognizedText: text.length > 0, text: text || '[arquivo TXT vazio]', labels: [] };
    } catch (error) {
      console.error('Erro ao processar arquivo TXT:', error);
      return { recognizedText: false, text: '[erro ao ler arquivo TXT]', labels: [] };
    }
  }
  // PDF
  else if (mime.includes('pdf')) {
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
  }
  // Imagem: usa a visão da OpenAI
  else if (mime.includes('image')) {
    return await processImageWithVision(media);
  }
  // Outros
  else {
    return { recognizedText: false, text: '[arquivo não suportado para extração de conteúdo]', labels: [] };
  }
}

/******************************************************************************
 * 4) Localiza ou cria Thread no banco e na OpenAI (com cache em memória)
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
 * 5) assistantResponse: envia prompt ao assistente e faz polling do run
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
        tool_outputs: outputs?.map((o: any) => ({ tool_call_id: o.id, output: JSON.stringify(o.output) })) || []
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    currentRun = await openai.beta.threads.runs.retrieve(threadId, run.id);
  }
  const messages = await openai.beta.threads.messages.list(threadId);
  const lastAssistantMsg = messages.data.filter((m: any) => m.run_id === run.id && m.role === 'assistant').pop();
  if (lastAssistantMsg && lastAssistantMsg.content && lastAssistantMsg.content[0]?.text?.value) {
    return lastAssistantMsg.content[0].text.value;
  }
  return 'Não foi possível obter a resposta do assistente.';
}

/******************************************************************************
 * 6) Mecanismo de buffer para agrupar mensagens de texto fragmentadas
 *****************************************************************************/
interface BufferData {
  texts: string[];
  timer: NodeJS.Timeout | null;
}

const messageBuffer = new Map<string, BufferData>();

async function flushMessageBuffer(sender: string, originalMessage: Message) {
  const buffer = messageBuffer.get(sender);
  if (buffer && buffer.texts.length > 0) {
    const combinedText = buffer.texts.join('\n');
    messageBuffer.delete(sender);
    await processUserMessage(combinedText, originalMessage);
  }
}

async function processUserMessage(userMessage: string, message: Message) {
  const dbThread = await findOrCreateThread(message.from);
  await ThreadMessage.create({ thread_id: dbThread.id!, role: 'user', content: userMessage });
  const response = await assistantResponse(dbThread.openai_thread_id, userMessage);
  console.log('Resposta do assistente:', response);
  await ThreadMessage.create({ thread_id: dbThread.id!, role: 'assistant', content: response });
  await message.reply(response || '[sem resposta do assistant]');
  console.log('Mensagem enviada ao usuário.');
}

/******************************************************************************
 * 7) Inicializa o bot do WhatsApp e configura o listener de mensagens
 *****************************************************************************/
const qrEmitter = new EventEmitter();
export { qrEmitter };

export const start = async () => {
  console.log('⏳ Inicializando cliente do WhatsApp...');
  const client = new WhatsAppClient({
    puppeteer: { args: ['--no-sandbox'] },
    authStrategy: new LocalAuth({ dataPath: path.join(process.cwd(), 'session') }),
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' }
  });

  client.on('qr', (qr: string) => {
    qrEmitter.emit('qr', qr);
    qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
      if (err) { console.error('Erro ao converter QR code:', err); return; }
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
      const chat = await message.getChat();
      await chat.sendStateTyping();
      // Se houver mídia, processa imediatamente e descarta o buffer do remetente
      if (message.hasMedia) {
        if (messageBuffer.has(message.from)) {
          messageBuffer.delete(message.from);
        }
        const media = await message.downloadMedia();
        let userMessage: string;
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
            if (result.labels.length > 0) {
              finalMessage += `Objetos/pessoas/animais possivelmente detectados:\n- ${result.labels.join('\n- ')}`;
            }
          } else {
            finalMessage += `Desculpe, mas não posso identificar as pessoas ou descrever detalhes específicos sobre a imagem. Porém, posso ajudar com perguntas ou informações gerais sobre o ambiente ou o contexto retratado. Se precisar, estou à disposição!`;
          }
          userMessage = finalMessage;
          console.log('Resultado do processamento do arquivo:', userMessage);
        }
        await processUserMessage(userMessage, message);
      } else {
        // Para mensagens de texto, agrupa mensagens fragmentadas
        const sender = message.from;
        const text = message.body.trim();
        if (!messageBuffer.has(sender)) {
          messageBuffer.set(sender, { texts: [], timer: null });
        }
        const buffer = messageBuffer.get(sender)!;
        buffer.texts.push(text);
        if (buffer.timer) clearTimeout(buffer.timer);
        buffer.timer = setTimeout(async () => { await flushMessageBuffer(sender, message); }, 2000);
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
