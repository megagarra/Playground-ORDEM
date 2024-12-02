// bot.ts
import axios from 'axios';
import qrcode from 'qrcode';
import { Client, Message, Chat, LocalAuth } from '@periskope/whatsapp-web.js';
import OpenAI from 'openai';
import constants from './constants';
import * as cli from './cli/ui';
import config from './config';
import dotenv from 'dotenv';
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Configuração da API OpenAI
const openai = new OpenAI({ apiKey: config.openAIAPIKey });

// Mapeamento de conversas ativas por usuário
const activeChats = new Map<string, any>();

// Emissor de eventos para QR Code
const qrEmitter = new EventEmitter();

// Definição das funções disponíveis para o assistente
const functions = [
  {
    name: 'create_order_service',
    description: 'Cria uma nova ordem de serviço com os detalhes fornecidos.',
    parameters: {
      type: 'object',
      properties: {
        tipo_servico: {
          type: 'string',
          description: 'Tipo de serviço a ser realizado.',
        },
        nome_cliente: {
          type: 'string',
          description: 'Nome do cliente que solicitou o serviço.',
        },
        endereco_cliente: {
          type: 'string',
          description: 'Endereço do cliente.',
        },
        data_hora_agendado: {
          type: 'string',
          description: 'Data para agendamento do serviço (formato DD-MM-YYYY).',
        },
        hora: {
          type: 'string',
          description: 'Hora específica do serviço (formato HH:MM).',
        },
        descricao_servico: {
          type: 'string',
          description: 'Descrição detalhada do serviço a ser realizado.',
        },
        funcionario_responsavel: {
          type: 'string',
          description: 'Nome do funcionário responsável pelo serviço.',
        },
        status: {
          type: 'string',
          description: 'Status atual da ordem de serviço. (Aberto, Andamento, Encerrado, Cancelado, etc...)',
        },
      },
      required: [
        'tipo_servico',
        'nome_cliente',
        'endereco_cliente',
        'data_hora_agendado',
        'hora',
        'descricao_servico',
        'funcionario_responsavel',
        'status',
      ],
    },
  },
  {
    name: 'get_order_service',
    description: 'Recupera os detalhes de uma ordem de serviço específica pelo ID.',
    parameters: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'ID único da ordem de serviço.',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'update_order_service',
    description: 'Atualiza os detalhes de uma ordem de serviço existente.',
    parameters: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'ID único da ordem de serviço a ser atualizada.',
        },
        tipo_servico: {
          type: 'string',
          description: 'Tipo de serviço a ser realizado.',
        },
        nome_cliente: {
          type: 'string',
          description: 'Nome do cliente que solicitou o serviço.',
        },
        endereco_cliente: {
          type: 'string',
          description: 'Endereço do cliente.',
        },
        data_hora_agendado: {
          type: 'string',
          description: 'Data para agendamento do serviço (formato DD-MM-YYYY).',
        },
        hora: {
          type: 'string',
          description: 'Hora específica do serviço (formato HH:MM).',
        },
        descricao_servico: {
          type: 'string',
          description: 'Descrição detalhada do serviço a ser realizado.',
        },
        funcionario_responsavel: {
          type: 'string',
          description: 'Nome do funcionário responsável pelo serviço.',
        },
        status: {
          type: 'string',
          description: 'Status atual da ordem de serviço.',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'delete_order_service',
    description: 'Exclui uma ordem de serviço específica pelo ID.',
    parameters: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'ID único da ordem de serviço a ser excluída.',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'get_all_order_services',
    description: 'Recupera uma lista de todas as ordens de serviço existentes.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'add_authorized_number',
    description: 'Adiciona um número de telefone à lista de números autorizados.',
    parameters: {
      type: 'object',
      properties: {
        phone_number: {
          type: 'string',
          description: 'Número de telefone a ser adicionado.',
        },
      },
      required: ['phone_number'],
    },
  },
  {
    name: 'remove_authorized_number',
    description: 'Remove um número de telefone da lista de números autorizados.',
    parameters: {
      type: 'object',
      properties: {
        phone_number: {
          type: 'string',
          description: 'Número de telefone a ser removido.',
        },
      },
      required: ['phone_number'],
    },
  },
];

// Função para interagir com o assistente e processar a mensagem recebida
async function handleIncomingMessage(message: Message, content: string) {
  const userId = message.from;

  try {
    // Obter o histórico de mensagens do usuário ou inicializar um novo
    let conversation = activeChats.get(userId) || [];

    // Adicionar a nova mensagem do usuário ao histórico
    conversation.push({ role: 'user', content: content });

    // Adicionar uma mensagem de sistema para orientar o comportamento do assistente
    const systemMessage = {
      role: 'system',
      content:
        'Você é um assistente especializado em gerenciamento de ordens de serviço. Responda de forma direta e somente sobre assuntos relacionados ao gerenciamento de ordens de serviço. Se a pergunta não for relevante, informe ao usuário que você só pode ajudar com tarefas relacionadas às ordens de serviço.',
    };

    // Simular digitação antes de enviar a resposta
    const chat = await message.getChat();
    await chat.sendStateTyping();

    // Envia a conversa completa para o assistente com as funções disponíveis
    let response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [systemMessage, ...conversation],
      functions: functions,
      function_call: 'auto',
    });

    let responseMessage = response.choices[0].message;

    // Loop para lidar com múltiplas interações até que o assistente retorne uma resposta final
    while (responseMessage.function_call) {
      const functionName = responseMessage.function_call.name;
      const functionArgs = JSON.parse(responseMessage.function_call.arguments);

      let functionResponse: string;

      switch (functionName) {
        case 'create_order_service':
          functionResponse = await createOrderService(functionArgs);
          break;
        case 'get_order_service':
          functionResponse = await getOrderService(functionArgs);
          break;
        case 'update_order_service':
          functionResponse = await updateOrderService(functionArgs);
          break;
        case 'delete_order_service':
          functionResponse = await deleteOrderService(functionArgs);
          break;
        case 'get_all_order_services':
          functionResponse = await getAllOrderServices();
          break;
        case 'add_authorized_number':
          functionResponse = await addAuthorizedNumber(functionArgs.phone_number);
          break;
        case 'remove_authorized_number':
          functionResponse = await removeAuthorizedNumber(functionArgs.phone_number);
          break;
        default:
          functionResponse = 'Função não reconhecida.';
      }

      // Adicionar a chamada da função e a resposta ao histórico
      conversation.push(responseMessage);
      conversation.push({ role: 'function', name: functionName, content: functionResponse });

      // Atualizar o histórico no Map
      activeChats.set(userId, conversation);

      // Enviar a conversa atualizada para o assistente
      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [systemMessage, ...conversation],
        functions: functions,
        function_call: 'auto',
      });

      responseMessage = response.choices[0].message;
    }

    // Adicionar a resposta final do assistente ao histórico
    conversation.push(responseMessage);

    // Atualizar o histórico no Map
    activeChats.set(userId, conversation);

    // Parar a simulação de digitação
    await chat.clearState();

    // Enviar a resposta final para o usuário
    const finalResponseText = responseMessage.content ?? 'Desculpe, não consegui processar sua solicitação.';
    await message.reply(finalResponseText);
  } catch (error) {
    console.error('Erro ao processar a mensagem:', error);
    // Parar a simulação de digitação em caso de erro
    const chat = await message.getChat();
    await chat.clearState();

    await message.reply('Erro ao processar a mensagem. Tente novamente mais tarde.');
  }
}

// Função para transcrever o áudio usando o OpenAI Whisper API
async function transcribeAudio(filePath: string): Promise<string | null> {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
      response_format: 'text',
      language: 'pt',
    });

    return transcription; // A resposta é um texto simples (string)
  } catch (error) {
    console.error('Erro ao transcrever o áudio:', error);
    return null;
  }
}


// Função auxiliar para converter a data
function formatDate(dateStr: string): string {
  const [day, month, year] = dateStr.split('-');
  return `${year}-${month}-${day}`; // Formato YYYY-MM-DD
}

// Funções CRUD para ordens de serviço usando axios
async function createOrderService(details: any): Promise<string> {
  try {
    // Converter a data para o formato YYYY-MM-DD
    const formattedDate = formatDate(details.data_hora_agendado);

    // Preparar os dados a serem enviados
    const payload = {
      tipo_servico: details.tipo_servico,
      nome_cliente: details.nome_cliente,
      endereco_cliente: details.endereco_cliente,
      data_hora_agendado: formattedDate,
      hora: details.hora,
      descricao_servico: details.descricao_servico,
      funcionario_responsavel: details.funcionario_responsavel,
      status: details.status,
    };

    const response = await axios.post(`${config.API_BASE_URL}/ordens-servico`, payload);

    return `Ordem de Serviço criada com sucesso! ID: ${response.data.id}`;
  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response && error.response.data) {
      const errorData = error.response.data;

      if (errorData.detail && Array.isArray(errorData.detail)) {
        const errors = errorData.detail.map((item: any) => {
          const field = item.loc[item.loc.length - 1];
          return `${field}: ${item.msg}`;
        });
        return `Os seguintes erros ocorreram: ${errors.join('; ')}. Por favor, corrija-os e tente novamente.`;
      } else if (errorData.detail && typeof errorData.detail === 'string') {
        return `Erro ao criar a ordem de serviço: ${errorData.detail}`;
      }
    }

    return 'Erro ao criar a ordem de serviço. Verifique os detalhes e tente novamente.';
  }
}

async function getOrderService({ order_id }: { order_id: string }): Promise<string> {
  try {
    const response = await axios.get(`${config.API_BASE_URL}/ordens-servico/${order_id}`);
    return `Detalhes da Ordem de Serviço:\n${formatOrderService(response.data)}`;
  } catch (error: any) {
    return 'Erro ao buscar a ordem de serviço. Verifique o ID e tente novamente.';
  }
}

async function updateOrderService(details: any): Promise<string> {
  const { order_id, ...updateFields } = details;
  try {
    // Obter os dados atuais da ordem de serviço
    const existingOrder = await getExistingOrderService(order_id);

    // Mesclar os dados existentes com os campos a serem atualizados
    const updatedOrder = { ...existingOrder, ...updateFields };

    // Enviar a requisição PUT com todos os campos
    await axios.put(`${config.API_BASE_URL}/ordens-servico/${order_id}`, updatedOrder);

    return `Ordem de serviço ${order_id} atualizada com sucesso.`;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response && error.response.data) {
        const errorData = error.response.data;
        if (errorData.detail && Array.isArray(errorData.detail)) {
          const errors = errorData.detail.map((item: any) => {
            const field = item.loc[item.loc.length - 1];
            return `${field}: ${item.msg}`;
          });
          return `Erro ao atualizar a ordem de serviço: ${errors.join('; ')}. Por favor, corrija-os e tente novamente.`;
        } else if (errorData.detail && typeof errorData.detail === 'string') {
          return `Erro ao atualizar a ordem de serviço: ${errorData.detail}`;
        }
      }
      return 'Erro ao atualizar a ordem de serviço. Resposta inválida do servidor.';
    } else {
      return 'Erro ao atualizar a ordem de serviço. Tente novamente mais tarde.';
    }
  }
}

async function deleteOrderService({ order_id }: { order_id: string }): Promise<string> {
  try {
    await axios.delete(`${config.API_BASE_URL}/ordens-servico/${order_id}`);
    return `Ordem de serviço ${order_id} excluída com sucesso.`;
  } catch (error: any) {
    return 'Erro ao excluir a ordem de serviço. Verifique o ID.';
  }
}

async function getAllOrderServices(): Promise<string> {
  try {
    const response = await axios.get(`${config.API_BASE_URL}/ordens-servico`);
    const orders = response.data;
    if (orders.length === 0) {
      return 'Nenhuma Ordem de Serviço encontrada.';
    }
    const formattedOrders = orders.map((order: any) => formatOrderService(order)).join('\n\n');
    return `Detalhes das Ordens de Serviço:\n\n${formattedOrders}`;
  } catch (error: any) {
    return 'Erro ao buscar as ordens de serviço. Tente novamente mais tarde.';
  }
}

async function getExistingOrderService(order_id: string): Promise<any> {
  try {
    const response = await axios.get(`${config.API_BASE_URL}/ordens-servico/${order_id}`);
    return response.data;
  } catch (error: any) {
    throw new Error('Não foi possível obter a ordem de serviço existente.');
  }
}

// Função auxiliar para formatar detalhes da ordem de serviço
function formatOrderService(order: any): string {
  return `
ID: ${order.id}
Tipo de Serviço: ${order.tipo_servico}
Nome do Cliente: ${order.nome_cliente}
Endereço: ${order.endereco_cliente}
Data e Hora Agendada: ${order.data_hora_agendado} ${order.hora}
Descrição do Serviço: ${order.descricao_servico}
Funcionário Responsável: ${order.funcionario_responsavel}
Status: ${order.status}
  `.trim();
}

// --------------------
// Funções para Números Autorizados
// --------------------

// Cache em memória para números autorizados
const authorizedNumbers = new Set<string>();
let isAuthorizedNumbersLoaded = false;

// Função para carregar os números autorizados da API
async function loadAuthorizedNumbers() {
  try {
    const response = await axios.get(`${config.API_BASE_URL}/authorized-numbers`);
    const numbers = response.data;

    authorizedNumbers.clear();
    for (const num of numbers) {
      authorizedNumbers.add(num.phone_number);
    }

    isAuthorizedNumbersLoaded = true;
  } catch (error) {
    console.error('Erro ao carregar números autorizados:', error);
  }
}

// Função para verificar se um número é autorizado usando o cache
function isAuthorizedNumber(phoneNumber: string): boolean {
  return authorizedNumbers.has(phoneNumber);
}

// Função para adicionar um número autorizado e atualizar o cache
async function addAuthorizedNumber(phoneNumber: string): Promise<string> {
  try {
    const response = await axios.post(`${config.API_BASE_URL}/authorized-numbers`, {
      phone_number: phoneNumber,
    });
    authorizedNumbers.add(phoneNumber); // Atualiza o cache
    return `Número ${phoneNumber} adicionado com sucesso aos números autorizados.`;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response && error.response.data && error.response.data.detail) {
        return `Erro ao adicionar número autorizado: ${error.response.data.detail}`;
      } else {
        return 'Erro ao adicionar número autorizado. Resposta inválida do servidor.';
      }
    } else {
      return 'Erro ao adicionar número autorizado. Tente novamente mais tarde.';
    }
  }
}

// Função para remover um número autorizado e atualizar o cache
async function removeAuthorizedNumber(phoneNumber: string): Promise<string> {
  try {
    // Primeiro, obter o ID do número autorizado com base no número de telefone
    const response = await axios.get(`${config.API_BASE_URL}/authorized-numbers`);
    const numbers = response.data;

    const numberToDelete = numbers.find((num: any) => num.phone_number === phoneNumber);

    if (!numberToDelete) {
      return `Número ${phoneNumber} não encontrado na lista de números autorizados.`;
    }

    // Remover o número autorizado usando o ID
    await axios.delete(`${config.API_BASE_URL}/authorized-numbers/${numberToDelete.id}`);
    authorizedNumbers.delete(phoneNumber); // Atualiza o cache
    return `Número ${phoneNumber} removido com sucesso dos números autorizados.`;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response && error.response.data && error.response.data.detail) {
        return `Erro ao remover número autorizado: ${error.response.data.detail}`;
      } else {
        return 'Erro ao remover número autorizado. Resposta inválida do servidor.';
      }
    } else {
      return 'Erro ao remover número autorizado. Tente novamente mais tarde.';
    }
  }
}

// Inicializa e configura o bot do WhatsApp
const start = async () => {
  cli.printIntro();

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
    // Emitir o QR Code através do EventEmitter
    qrEmitter.emit('qr', qr);

    // Exibir o QR Code no terminal
    qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
      if (err) {
        return;
      }
      cli.printQRCode(url);
    });
  });

  client.on('authenticated', () => {
    cli.printAuthenticated();
  });

  client.on('auth_failure', () => {
    cli.printAuthenticationFailure();
  });

  client.on('ready', async () => {
    cli.printOutro();
    await loadAuthorizedNumbers(); // Carrega os números autorizados ao iniciar
  });

  // Atualizar o cache de números autorizados periodicamente (opcional)
  setInterval(loadAuthorizedNumbers, 5 * 60 * 1000); // Atualiza a cada 5 minutos

  client.on('message', async (message: Message) => {
    try {
      // Ignorar mensagens enviadas pelo próprio bot
      if (message.fromMe) {
        return;
      }

      // Verificar se os números autorizados foram carregados
      if (!isAuthorizedNumbersLoaded) {
        return;
      }

      // Obter o chat associado à mensagem
      let chat: Chat;
      try {
        chat = await message.getChat();
      } catch (error) {
        return;
      }

      // Verificar se a mensagem veio de um grupo
      const chatId = chat.id._serialized;
      if (chatId.endsWith('@g.us')) {
        return;
      }

      // Obter o número de telefone do remetente
      const senderNumber = message.from.split('@')[0];

      // Verificar se o número é autorizado
      const authorized = isAuthorizedNumber(senderNumber);

      if (!authorized) {
        return;
      }

      // Verificar se a mensagem é um comando !adicionar ou !remover
      const messageBody = message.body.trim();
      if (messageBody.startsWith('!adicionar')) {
        const phoneNumber = messageBody.replace('!adicionar', '').trim();

        if (!phoneNumber) {
          await message.reply(
            'Por favor, forneça um número de telefone para adicionar. Exemplo: !adicionar 5511999999999'
          );
          return;
        }

        // Simular digitação
        await chat.sendStateTyping();

        const addResponse = await addAuthorizedNumber(phoneNumber);

        // Simular digitação por um tempo proporcional ao tamanho da resposta
        const typingDelay = Math.min(addResponse.length * 50, 5000);
        await new Promise((resolve) => setTimeout(resolve, typingDelay));

        // Parar a simulação de digitação
        await chat.clearState();

        await message.reply(addResponse);
        return;
      }

      if (messageBody.startsWith('!remover')) {
        const phoneNumber = messageBody.replace('!remover', '').trim();

        if (!phoneNumber) {
          await message.reply(
            'Por favor, forneça um número de telefone para remover. Exemplo: !remover 5511999999999'
          );
          return;
        }

        // Simular digitação
        await chat.sendStateTyping();

        const removeResponse = await removeAuthorizedNumber(phoneNumber);

        // Simular digitação por um tempo proporcional ao tamanho da resposta
        const typingDelay = Math.min(removeResponse.length * 50, 5000);
        await new Promise((resolve) => setTimeout(resolve, typingDelay));

        // Parar a simulação de digitação
        await chat.clearState();

        await message.reply(removeResponse);
        return;
      }

      // Verificar se a mensagem é um áudio
      if (message.hasMedia && (message.type === 'audio' || message.type === 'ptt')) {
        // Simular digitação
        await chat.sendStateTyping();

        // Baixar o arquivo de áudio
        const media = await message.downloadMedia();

        // Salvar o arquivo de áudio temporariamente
        const audioBuffer = Buffer.from(media.data, 'base64');
        const tempFilePath = path.join(__dirname, `temp_audio_${Date.now()}.ogg`);
        fs.writeFileSync(tempFilePath, audioBuffer);

        // Enviar o áudio para o Whisper API
        const transcription = await transcribeAudio(tempFilePath);

        // Remover o arquivo de áudio temporário
        fs.unlinkSync(tempFilePath);

        // Parar a simulação de digitação
        await chat.clearState();

        if (transcription) {
          // Processar a transcrição como uma mensagem de texto
          await handleIncomingMessage(message, transcription);
        } else {
          await message.reply('Desculpe, não consegui transcrever o áudio.');
        }

        return;
      }

      // Processar outras mensagens normalmente
      await handleIncomingMessage(message, message.body);
    } catch (error) {
      console.error('Erro ao processar a mensagem:', error);

      // Parar a simulação de digitação em caso de erro
      const chat = await message.getChat();
      await chat.clearState();

      await message.reply('Ocorreu um erro ao processar sua mensagem. Tente novamente mais tarde.');
    }
  });

  client.initialize();
};

export { start, qrEmitter };
