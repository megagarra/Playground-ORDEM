import axios from 'axios';
import qrcode from 'qrcode';
import { Client, Message, LocalAuth } from '@periskope/whatsapp-web.js';
import OpenAI from 'openai';
import constants from './constants';
import * as cli from './cli/ui';
import dotenv from 'dotenv';
import EventEmitter from 'events';

dotenv.config();

// Debug: Verificar variáveis de ambiente
console.log('ENV API_BASE_URL:', process.env.API_BASE_URL);
console.log('ENV OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Definida' : 'Não definida');
console.log('ENV ASSISTANT_ID:', process.env.ASSISTANT_ID);

// Configuração da API OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;
const qrEmitter = new EventEmitter();

// Função dinâmica para chamadas de API externas
async function callExternalAPI(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  parameters: any
): Promise<string> {
  try {
    if (!process.env.API_BASE_URL) {
      console.error('❌ ERRO: API_BASE_URL não definida nas variáveis de ambiente.');
      return '❌ Erro: API_BASE_URL não definida.';
    }

    const url = `${process.env.API_BASE_URL}${endpoint}`;

    console.log('Chamando API externa:', { method, url, parameters });

    const response = await axios({
      method,
      url,
      headers: { 'Content-Type': 'application/json' },
      data: method === 'POST' || method === 'PUT' ? parameters : undefined,
      params: method === 'GET' ? parameters : undefined,
    });

    console.log('Resposta da API externa:', response.data);

    return `✅ Sucesso:\n${JSON.stringify(response.data, null, 2)}`;
  } catch (error: any) {
    console.error('❌ Erro na API externa:', error?.message);
    console.log('Detalhes do erro API externa:', error?.response?.data);
    return `❌ Erro: ${error.response?.data?.message || error.message}`;
  }
}

// Processa a mensagem e chama o Assistant Playground
async function processMessage(content: string): Promise<string> {
  console.log('processMessage - conteúdo da mensagem:', content);
  try {
    const thread = await openai.beta.threads.create();
    console.log('Thread criada:', thread);

    const userMsg = await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content,
    });
    console.log('Mensagem do usuário enviada para o thread:', userMsg);

    const run = await openai.beta.threads.runs.create(thread.id, { assistant_id: ASSISTANT_ID });
    console.log('Run criado:', run);

    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    console.log('Run status inicial:', runStatus);

    while (runStatus.status === 'in_progress') {
      console.log('Aguardando processamento do run...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log('Run status atualizado:', runStatus);
    }

    // Caso o assistente exija chamada de função (tool)
    if (runStatus.required_action?.type === 'submit_tool_outputs') {
      console.log('Run requer action submit_tool_outputs:', runStatus.required_action);
      const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;

      const toolOutputs = await Promise.all(
        toolCalls.map(async (tool) => {
          console.log('Processando tool call:', tool);
          const params = JSON.parse(tool.function.arguments);
          console.log('Parâmetros do tool call:', params);
          const { endpoint, method = 'GET', ...otherParams } = params;
          const result = await callExternalAPI(endpoint, method as 'GET'|'POST'|'PUT'|'DELETE', otherParams);
          console.log('Resultado do tool call:', result);
          return { tool_call_id: tool.id, output: result };
        })
      );

      console.log('Enviando tool_outputs para o Run:', toolOutputs);
      await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, { tool_outputs: toolOutputs });

      // Após enviar os tool_outputs, precisamos aguardar o assistente gerar a resposta final
      // Vamos fazer polling novamente até que o run esteja completo ou tenhamos uma mensagem final
      let finalRunStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      while (finalRunStatus.status === 'in_progress' || finalRunStatus.status === 'requires_action') {
        console.log('Aguardando a resposta final do assistente após tool_outputs...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        finalRunStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        console.log('Run status pós-tool_outputs atualizado:', finalRunStatus);
      }
    }

    // Agora deve haver uma resposta final do assistente
    const messages = await openai.beta.threads.messages.list(thread.id);
    console.log('Mensagens retornadas pelo OpenAI:', JSON.stringify(messages, null, 2));

    // Procurar a última mensagem do assistant com texto
    const assistantMessage = messages.data
      .slice() // copiar o array
      .reverse() // inverter para começar a ver do fim (últimas mensagens primeiro)
      .find((msg: any) => msg.role === 'assistant' && msg.content && msg.content[0]?.text?.value);

    if (assistantMessage && assistantMessage.content && assistantMessage.content[0].text && assistantMessage.content[0].text.value) {
      return assistantMessage.content[0].text.value;
    } else {
      console.error('Não foi encontrada uma resposta final do assistente no formato esperado.');
      return '❌ Erro: A resposta do assistente não está em um formato reconhecido.';
    }
  } catch (error: any) {
    console.error('Erro ao processar mensagem:', error?.message);
    console.log('Detalhes do erro no processMessage:', error);
    return '❌ Erro ao processar a solicitação.';
  }
}



// Inicialização do bot
const start = async () => {
  console.log('⏳ Inicializando o cliente do WhatsApp...');

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
    console.log('QR code recebido:', qr);
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
    console.log('Cliente WhatsApp autenticado.');
    cli.printAuthenticated();
  });

  client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação do WhatsApp:', msg);
    cli.printAuthenticationFailure();
  });

  client.on('ready', async () => {
    console.log('Cliente WhatsApp pronto.');
    cli.printOutro();
  });

  client.on('message', async (message: Message) => {
    console.log('Nova mensagem recebida:', message);
    try {
      if (message.fromMe) {
        console.log('Mensagem ignorada (enviada pelo próprio bot).');
        return; // Ignorar mensagens enviadas pelo bot
      }
  
      const chat = await message.getChat();
      console.log('Chat obtido:', chat.id._serialized);
      await chat.sendStateTyping(); // Simular digitação
  
      const userMessage = message.body.trim(); // Mensagem enviada pelo usuário
      console.log('Conteúdo da mensagem do usuário:', userMessage);
  
      // Processar a mensagem usando o Assistant API
      const response = await processMessage(userMessage);
      console.log('Resposta do assistente:', response);
  
      // Enviar a resposta ao usuário no WhatsApp
      await message.reply(response);
      console.log('Resposta enviada ao usuário.');
  
      await chat.clearState(); // Parar a simulação de digitação
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
