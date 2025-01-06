import axios from 'axios';
import qrcode from 'qrcode';
import { Client, Message, LocalAuth } from '@periskope/whatsapp-web.js';
import OpenAI from 'openai';
import constants from './constants';
import * as cli from './cli/ui';
import dotenv from 'dotenv';
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Configuração da API OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;
const qrEmitter = new EventEmitter();

/**
 * Chama uma API externa de forma dinâmica.
 * @param endpoint Caminho da API (ex: /users).
 * @param method Método HTTP a ser usado (GET, POST, PUT ou DELETE).
 * @param parameters Parâmetros ou corpo da requisição.
 * @returns A resposta da API em formato string.
 */
async function callExternalAPI(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  parameters: any
): Promise<string> {
  try {
    if (!process.env.API_BASE_URL) {
      return '❌ Erro: API_BASE_URL não definida.';
    }

    const url = `${process.env.API_BASE_URL}${endpoint}`;

    const response = await axios({
      method,
      url,
      headers: { 'Content-Type': 'application/json' },
      data: method === 'POST' || method === 'PUT' ? parameters : undefined,
      params: method === 'GET' ? parameters : undefined,
    });

    return `✅ Sucesso:\n${JSON.stringify(response.data, null, 2)}`;
  } catch (error: any) {
    console.error('❌ Erro na API externa:', error?.message);

    return `❌ Erro: ${error.response?.data?.message || error.message}`;
  }
}

/**
 * Transcreve um áudio usando o Whisper da OpenAI.
 * @param base64Audio Base64 do áudio.
 * @returns Texto transcrito.
 */
async function transcribeAudio(base64Audio: string): Promise<string> {
  try {
    // Salva o áudio em um arquivo temporário (MP3, OGG, WAV, etc.).
    // Para simplificar, usaremos MP3, mas confirme se a extensão
    // está adequada ao tipo de áudio recebido.
    const tempFilePath = path.join(__dirname, 'tempAudio.mp3');
    const buffer = Buffer.from(base64Audio, 'base64');
    fs.writeFileSync(tempFilePath, buffer);

    // Chama a API de transcrição
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1',
      // language: 'pt', // descomente se desejar forçar PT-BR, etc.
    });

    // Apaga o arquivo temporário após uso
    fs.unlinkSync(tempFilePath);

    // O objeto retornado geralmente tem a chave 'text' com o resultado
    return transcription.text;
  } catch (err: any) {
    console.error('Erro na transcrição do áudio:', err.message);
    throw new Error('Não foi possível transcrever o áudio.');
  }
}

/**
 * Processa a mensagem (texto) e obtém a resposta do assistente usando o Playground (OpenAI).
 * @param content Conteúdo da mensagem do usuário
 * @returns Resposta final do assistente
 */
async function processMessage(content: string): Promise<string> {


  try {
    // Cria uma nova thread
    const thread = await openai.beta.threads.create();


    // Envia a mensagem do usuário
    const userMsg = await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content,
    });

    // Inicia o run
    const run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });


    // Verifica o status inicial
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);


    // Aguarda até o run sair de 'queued' ou 'in_progress'
    while (['queued', 'in_progress'].includes(runStatus.status)) {
      ('Aguardando processamento do run...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);

    }

    // Caso o assistente exija chamada de função (tool)
    if (runStatus.required_action?.type === 'submit_tool_outputs') {


      const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;

      // Para cada tool call, realiza a chamada externa e coleta o resultado
      const toolOutputs = await Promise.all(
        toolCalls.map(async (tool) => {

          const params = JSON.parse(tool.function.arguments);


          const { endpoint, method = 'GET', ...otherParams } = params;
          const result = await callExternalAPI(endpoint, method as 'GET' | 'POST' | 'PUT' | 'DELETE', otherParams);


          return { tool_call_id: tool.id, output: result };
        })
      );

      // Envia as saídas (tool_outputs) para o run

      await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, { tool_outputs: toolOutputs });

      // Aguarda até o run completar após a submissão das tools
      let finalRunStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);

      while (['queued', 'in_progress', 'requires_action'].includes(finalRunStatus.status)) {
        ('Aguardando a resposta final do assistente após tool_outputs...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        finalRunStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);

      }
    }

    // Busca todas as mensagens do thread para encontrar a última do "assistant"
    const messages = await openai.beta.threads.messages.list(thread.id);


    // Encontra a última mensagem do assistente que contenha texto
    const assistantMessage = messages.data
      .slice() // copia o array
      .reverse() // inverte para olhar as mais recentes primeiro
      .find(
        (msg: any) =>
          msg.role === 'assistant' &&
          msg.content &&
          msg.content[0]?.text?.value
      );

    // Verifica se encontrou a mensagem no formato esperado
    if (
      assistantMessage &&
      assistantMessage.content &&
      assistantMessage.content[0].text &&
      assistantMessage.content[0].text.value
    ) {
      return assistantMessage.content[0].text.value;
    } else {
      console.error('Não foi encontrada uma resposta final do assistente no formato esperado.');
      return '❌ Erro: A resposta do assistente não está em um formato reconhecido.';
    }
  } catch (error: any) {
    console.error('Erro ao processar mensagem:', error?.message);
    return '❌ Erro ao processar a solicitação.';
  }
}

/**
 * Inicializa o bot do WhatsApp e configura listeners para eventos importantes.
 */
const start = async () => {
  ('⏳ Inicializando o cliente do WhatsApp...');

  const client = new Client({
    puppeteer: { args: ['--no-sandbox'] },
    authStrategy: new LocalAuth({ dataPath: constants.sessionPath }),
    webVersionCache: {
      type: 'remote',
      remotePath:
        'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
  });

  client.on('qr', (qr: string) => {
    qrEmitter.emit('qr', qr);

    qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
      if (err) {
        console.error('Erro ao converter QR code:', err);
        return;
      }
      cli.printQRCode(url);
    });
  });

  client.on('authenticated', () => {
    ('Cliente WhatsApp autenticado.');
    cli.printAuthenticated();
  });

  client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação do WhatsApp:', msg);
    cli.printAuthenticationFailure();
  });

  client.on('ready', async () => {
    ('Cliente WhatsApp pronto.');
    cli.printOutro();
  });

  client.on('message', async (message: Message) => {

    try {
      // Ignora mensagens enviadas pelo próprio bot
      if (message.fromMe) {
        ('Mensagem ignorada (enviada pelo próprio bot).');
        return;
      }

      const chat = await message.getChat();

      await chat.sendStateTyping(); // Simula "digitando..."

      // Se for áudio (voice note), transcreve; se for texto, segue normal.
      let userMessage: string;

      // Tipos ptt ou audio representam áudios no WhatsApp
      if (message.type === 'ptt' || message.type === 'audio') {
        ('Recebido um áudio. Iniciando transcrição...');
        if (!message.hasMedia) {
          // Caso raro: a mensagem está marcada como áudio, mas sem mídia.
          throw new Error('Mensagem de áudio sem mídia disponível.');
        }
        const media = await message.downloadMedia(); // baixa o áudio em base64
        userMessage = await transcribeAudio(media.data);
      } else {
        // Caso não seja áudio, tratamos como texto
        userMessage = message.body.trim();
      }


      // Processa usando o Playground do OpenAI
      const response = await processMessage(userMessage);

      // Envia a resposta ao usuário no WhatsApp
      await message.reply(response);
      ('Resposta enviada ao usuário.');

      await chat.clearState(); // Para de simular "digitando..."
    } catch (error) {
      console.error('Erro ao processar a mensagem:', error);
      const chat = await message.getChat();
      await chat.clearState();
      await message.reply('❌ Ocorreu um erro ao processar sua mensagem. Tente novamente mais tarde.');
    }
  });

  client.initialize();
};

export { start, qrEmitter };
