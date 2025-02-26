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
  recognizedText: boolean;  // indica se houve algum conteúdo (texto ou descrição) reconhecido
  text: string;             // texto ou descrição extraída
  labels: string[];         // lista de labels (opcional, caso use outro método)
}

// Função para usar a visão da OpenAI para analisar imagens
async function processImageWithVision(media: any): Promise<ProcessResult> {
  const mime = media.mimetype || '';
  // Cria uma URL de dados com o conteúdo da imagem
  const dataUrl = `data:${mime};base64,${media.data}`;
  try {
    // Chama a API de chat com mensagem contendo a imagem
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // ou outro modelo com visão habilitada
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Faça uma analise completa da imagem ou arquvio, não perca nenhum delathe, e faça o detalhamento" },
            {
              type: "image_url",
              image_url: { url: dataUrl }
            }
          ]
        }
      ],
      max_tokens: 300,
    });
    const answer = response.choices[0].message.content;
    return {
      recognizedText: answer && answer.trim().length > 0,
      text: answer,
      labels: [] // você pode extrair labels se desejar
    };
  } catch (error) {
    console.error("Erro ao analisar imagem com OpenAI:", error);
    return { recognizedText: false, text: "[erro ao analisar a imagem com OpenAI]", labels: [] };
  }
}

async function processFileAttachment(media: any): Promise<ProcessResult> {
  const mime = media.mimetype || '';

  // Para arquivos TXT: decodifica o Base64 para string
  if (mime.includes('text/plain')) {
    try {
      const text = Buffer.from(media.data, 'base64').toString('utf-8').trim();
      return {
        recognizedText: text.length > 0,
        text: text || '[arquivo TXT vazio]',
        labels: []
      };
    } catch (error) {
      console.error('Erro ao processar arquivo TXT:', error);
      return { recognizedText: false, text: '[erro ao ler arquivo TXT]', labels: [] };
    }
  }
  // Para arquivos PDF: utiliza pdf-parse para extrair o texto
  else if (mime.includes('pdf')) {
    try {
      const pdfParse = require('pdf-parse');
      const buffer = Buffer.from(media.data, 'base64');
      const data = await pdfParse(buffer);
      const text = data.text.trim();
      return {
        recognizedText: text.length > 10,
        text: text || '[PDF sem texto reconhecível]',
        labels: []
      };
    } catch (error) {
      console.error('Erro ao processar PDF:', error);
      return { recognizedText: false, text: '[erro ao extrair texto do PDF]', labels: [] };
    }
  }
  // Para imagens: utiliza a visão da OpenAI para analisar o conteúdo
  else if (mime.includes('image')) {
    return await processImageWithVision(media);
  }
  // Outros tipos não suportados
  else {
    return { recognizedText: false, text: '[arquivo não suportado para extração de conteúdo]', labels: [] };
  }
}

/******************************************************************************
 * 4) Localiza ou cria Thread no "banco" e também na OpenAI (sem cache)
 *****************************************************************************/
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

export async function findOrCreateThread(identifier: string, meta?: any): Promise<IThreadModel> {
  // Tenta achar no banco de dados
  const existing = await findThreadByIdentifier(identifier);
  if (existing) {
    console.log('Thread encontrada no banco:', existing.openai_thread_id);
    return existing;
  }

  // Cria a thread na OpenAI
  const openaiThread = await openai.beta.threads.create({
    metadata: { identifier, medium: 'whatsapp', ...meta }
  });

  // Salva a nova thread no banco (por padrão, "paused" será false)
  const newThread = await createThreadInDB({
    identifier,
    openai_thread_id: openaiThread.id,
    medium: 'whatsapp'
  });

  console.log('Nova thread criada:', newThread.get());
  return newThread;
}

/******************************************************************************
 * 5) assistantResponse: envia prompt ao Thread, cria 'run' e faz polling
 *****************************************************************************/
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
      await new Promise((resolve) => setTimeout(resolve, 500));
      return assistantResponse(threadId, prompt, tools, callback);
    }
  }

  // Cria mensagem do usuário (no endpoint da OpenAI)
  await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: prompt
  });

  // Cria run (desabilitando tools para evitar requires_action)
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

  // Loop de polling até terminar
  while (['queued', 'in_progress', 'requires_action'].includes(currentRun.status)) {
    if (currentRun.status === 'requires_action' && callback) {
      const outputs = await callback(currentRun);
      await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
        tool_outputs:
          outputs?.map((o: any) => ({
            tool_call_id: o.id,
            output: JSON.stringify(o.output)
          })) || []
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
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
 * 6) Inicializa o bot do WhatsApp e configura o listener de mensagens
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

      // Recupera ou cria a thread correspondente à conversa
      const dbThread = await findOrCreateThread(message.from);

      // Verifica se a conversa está pausada (status armazenado no banco)
      if (dbThread.paused) {
        console.log(`Conversa com ${message.from} está pausada. Ignorando mensagem.`);
        return;
      }

      const chat = await message.getChat();
      await chat.sendStateTyping();

      let userMessage: string;

      // Se houver mídia na mensagem
      if (message.hasMedia) {
        const media = await message.downloadMedia();
        // Se for áudio/ptt, realiza transcrição
        if (message.type === 'ptt' || message.type === 'audio') {
          console.log('Recebido áudio. Iniciando transcrição...');
          userMessage = await transcribeAudio(media.data);
          console.log('Texto transcrito:', userMessage);
        } else {
          // Para outros tipos de arquivo: processa a imagem com OpenAI
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
      } else {
        // Se for mensagem de texto
        userMessage = message.body.trim();
      }

      // 1) Salva mensagem do usuário no BD
      await ThreadMessage.create({
        thread_id: dbThread.id!,
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
