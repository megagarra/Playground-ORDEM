import axios from 'axios';
import qrcode from 'qrcode';
import { Client, Message, Events, LocalAuth } from '@periskope/whatsapp-web.js';
import OpenAI from 'openai';
import constants from './constants';
import * as cli from './cli/ui';
import config from './config';

// Configura a conexão com a OpenAI usando o ID do assistente específico
const openai = new OpenAI({ apiKey: config.openAIAPIKey });
const assistantId = config.assistantId;

// Mapeamento de conversas ativas por usuário
const activeChats = new Map();

// Definição das funções disponíveis
const functions = [
  {
    "name": "create_order_service",
    "description": "Cria uma nova ordem de serviço com os detalhes fornecidos.",
    "parameters": {
      "type": "object",
      "properties": {
        "tipo_servico": {
          "type": "string",
          "description": "Tipo de serviço a ser realizado."
        },
        "nome_cliente": {
          "type": "string",
          "description": "Nome do cliente que solicitou o serviço."
        },
        "endereco_cliente": {
          "type": "string",
          "description": "Endereço do cliente."
        },
        "data_hora_agendado": {
          "type": "string",
          "description": "Apenas Data para ser agendadas para o serviço (formato YYYY-MM-DD)."
        },
        "hora": {
          "type": "string",
          "description": "Hora específica do serviço (formato HH:MM)."
        },
        "descricao_servico": {
          "type": "string",
          "description": "Descrição detalhada do serviço a ser realizado."
        },
        "funcionario_responsavel": {
          "type": "string",
          "description": "Nome do funcionário responsável pelo serviço."
        },
        "status": {
          "type": "string",
          "description": "Status atual da ordem de serviço."
        }
      },
      "required": [
        "tipo_servico",
        "nome_cliente",
        "endereco_cliente",
        "data_hora_agendado",
        "descricao_servico",
        "funcionario_responsavel"
      ]
    }
  },
  {
    "name": "get_order_service",
    "description": "Recupera os detalhes de uma ordem de serviço específica pelo ID.",
    "parameters": {
      "type": "object",
      "properties": {
        "order_id": {
          "type": "string",
          "description": "ID único da ordem de serviço."
        }
      },
      "required": ["order_id"]
    }
  },
  {
    "name": "update_order_service",
    "description": "Atualiza os detalhes de uma ordem de serviço existente.",
    "parameters": {
      "type": "object",
      "properties": {
        "order_id": {
          "type": "string",
          "description": "ID único da ordem de serviço a ser atualizada."
        },
        "tipo_servico": {
          "type": "string",
          "description": "Tipo de serviço a ser realizado."
        },
        "nome_cliente": {
          "type": "string",
          "description": "Nome do cliente que solicitou o serviço."
        },
        "endereco_cliente": {
          "type": "string",
          "description": "Endereço do cliente."
        },
        "data_hora_agendado": {
          "type": "string",
          "description": "Data e hora agendadas para o serviço (formato YYYY-MM-DD HH:MM)."
        },
        "hora": {
          "type": "string",
          "description": "Hora específica do serviço (formato HH:MM)."
        },
        "descricao_servico": {
          "type": "string",
          "description": "Descrição detalhada do serviço a ser realizado."
        },
        "funcionario_responsavel": {
          "type": "string",
          "description": "Nome do funcionário responsável pelo serviço."
        },
        "status": {
          "type": "string",
          "description": "Status atual da ordem de serviço."
        }
      },
      "required": ["order_id"]
    }
  },
  {
    "name": "delete_order_service",
    "description": "Exclui uma ordem de serviço específica pelo ID.",
    "parameters": {
      "type": "object",
      "properties": {
        "order_id": {
          "type": "string",
          "description": "ID único da ordem de serviço a ser excluída."
        }
      },
      "required": ["order_id"]
    }
  },
  {
    "name": "get_all_order_services",
    "description": "Recupera uma lista de todas as ordens de serviço existentes.",
    "parameters": {
      "type": "object",
      "properties": {}
    }
  }
];

// Função para interagir com o assistente e processar a mensagem recebida
async function handleIncomingMessage(message) {
    const userId = message.from;
    const content = message.body;

    try {
        // Obter o histórico de mensagens do usuário ou inicializar um novo
        let conversation = activeChats.get(userId) || [];

        // Adicionar a nova mensagem do usuário ao histórico
        conversation.push({ role: 'user', content: content });

        // Envia a conversa completa para o assistente com as funções disponíveis
        const response = await openai.chat.completions.create({
            model: "gpt-4", // Modelo correto
            messages: conversation,
            functions: functions,
            function_call: "auto", // Permite que o modelo escolha quando chamar uma função
        });

        const responseMessage = response.choices[0].message;

        // Verifica se o assistente chamou uma função
        if (responseMessage.function_call) {
            const functionName = responseMessage.function_call.name;
            const functionArgs = JSON.parse(responseMessage.function_call.arguments);

            let functionResponse;

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
                default:
                    functionResponse = 'Função não reconhecida.';
            }

            // Adicionar a chamada da função e a resposta ao histórico
            conversation.push(responseMessage);
            conversation.push({ role: 'function', name: functionName, content: functionResponse });

            // Atualizar o histórico no Map
            activeChats.set(userId, conversation);

            // Enviar a resposta da função de volta para o usuário
            await message.reply(functionResponse);

        } else {
            // Resposta normal do assistente
            const respostaAI = responseMessage.content;

            // Adicionar a resposta do assistente ao histórico
            conversation.push(responseMessage);

            // Atualizar o histórico no Map
            activeChats.set(userId, conversation);

            await message.reply(respostaAI);
        }

    } catch (error) {
        console.error('Erro ao processar a mensagem:', error);
        await message.reply('Erro ao processar a mensagem. Tente novamente mais tarde.');
    }
}

// Funções CRUD para ordens de serviço usando axios
async function createOrderService(details) {
    try {
        const response = await axios.post('http://127.0.0.1:8000/ordens-servico', {
            tipo_servico: details.tipo_servico,
            nome_cliente: details.nome_cliente,
            endereco_cliente: details.endereco_cliente,
            data_hora_agendado: details.data_hora_agendado,
            hora: details.hora,
            descricao_servico: details.descricao_servico,
            funcionario_responsavel: details.funcionario_responsavel,
            status: details.status || 'Pendente' // Valor padrão para status, se não fornecido
        });

        return `Ordem de Serviço criada com sucesso! ID: ${response.data.id}`;
    } catch (error) {
        console.error('Erro ao criar ordem de serviço:', error);
        return 'Erro ao criar a ordem de serviço. Verifique os detalhes e tente novamente.';
    }
}

async function getOrderService({ order_id }) {
    try {
        const response = await axios.get(`http://127.0.0.1:8000/ordens-servico/${order_id}`);
        return `Detalhes da Ordem de Serviço:\n${formatOrderService(response.data)}`;
    } catch (error) {
        console.error('Erro ao buscar ordem de serviço:', error);
        return 'Erro ao buscar a ordem de serviço. Verifique o ID e tente novamente.';
    }
}

async function getExistingOrderService(order_id) {
    try {
        const response = await axios.get(`http://127.0.0.1:8000/ordens-servico/${order_id}`);
        return response.data;
    } catch (error) {
        console.error('Erro ao obter ordem de serviço existente:', error);
        throw new Error('Não foi possível obter a ordem de serviço existente.');
    }
}

async function updateOrderService(details) {
    const { order_id, ...updateFields } = details;
    try {
        // Obter os dados atuais da ordem de serviço
        const existingOrder = await getExistingOrderService(order_id);
        
        // Mesclar os dados existentes com os campos a serem atualizados
        const updatedOrder = { ...existingOrder, ...updateFields };
        
        // Enviar a requisição PUT com todos os campos
        await axios.put(`http://127.0.0.1:8000/ordens-servico/${order_id}`, updatedOrder);
        
        return `Ordem de serviço ${order_id} atualizada com sucesso.`;
    } catch (error) {
        console.error('Erro ao atualizar ordem de serviço:', error);
        
        if (axios.isAxiosError(error)) {
            if (error.response && error.response.data && error.response.data.detail) {
                console.error('Detalhes do erro:', error.response.data.detail);
                return `Erro ao atualizar a ordem de serviço: ${JSON.stringify(error.response.data.detail)}`;
            } else {
                return 'Erro ao atualizar a ordem de serviço. Resposta inválida do servidor.';
            }
        } else {
            return 'Erro ao atualizar a ordem de serviço. Tente novamente mais tarde.';
        }
    }
}

async function deleteOrderService({ order_id }) {
    try {
        await axios.delete(`http://127.0.0.1:8000/ordens-servico/${order_id}`);
        return `Ordem de serviço ${order_id} excluída com sucesso.`;
    } catch (error) {
        console.error('Erro ao excluir ordem de serviço:', error);
        return 'Erro ao excluir a ordem de serviço. Verifique o ID.';
    }
}

async function getAllOrderServices() {
    try {
        const response = await axios.get('http://127.0.0.1:8000/ordens-servico');
        const orders = response.data;
        if (orders.length === 0) {
            return 'Nenhuma Ordem de Serviço encontrada.';
        }
        const formattedOrders = orders.map(order => formatOrderService(order)).join('\n\n');
        return `Detalhes das Ordens de Serviço:\n\n${formattedOrders}`;
    } catch (error) {
        console.error('Erro ao buscar ordens de serviço:', error);
        return 'Erro ao buscar as ordens de serviço. Tente novamente mais tarde.';
    }
}

// Função auxiliar para formatar detalhes da ordem de serviço
function formatOrderService(order) {
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

// Inicializa e configura o bot do WhatsApp
const start = async () => {
    cli.printIntro();

    const client = new Client({
        puppeteer: { args: ['--no-sandbox'] },
        authStrategy: new LocalAuth({ dataPath: constants.sessionPath }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
    });

    client.on(Events.QR_RECEIVED, (qr) => {
        qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
            if (err) throw err;
            cli.printQRCode(url);
        });
    });

    client.on(Events.AUTHENTICATED, () => cli.printAuthenticated());
    client.on(Events.AUTHENTICATION_FAILURE, () => cli.printAuthenticationFailure());

    client.on(Events.READY, () => {
        cli.printOutro();
    });

    client.on(Events.MESSAGE_RECEIVED, async (message) => {
        if (message.from === constants.statusBroadcast || message.fromMe) return;

        if ((await message.getChat()).isGroup) {
            const phoneNumber = `${config.whatsAppNumber}@c.us`;
            const mentionIds = message.mentionedIds.map(id => id.toString());
            if (mentionIds.includes(phoneNumber)) await handleIncomingMessage(message);
        } else {
            await handleIncomingMessage(message);
        }
    });

    client.initialize();
};

export { start };
