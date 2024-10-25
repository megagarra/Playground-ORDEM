import axios from 'axios';
import qrcode from 'qrcode';
import { Client, Message, Events, LocalAuth } from '@periskope/whatsapp-web.js';
import OpenAI from 'openai';
import constants from './constants';
import * as cli from './cli/ui';
import config from './config';

// Configura a conexão com a OpenAI usando o ID do assistente específico
const openai = new OpenAI({ apiKey: config.openAIAPIKey });
const assistantId = config.openAIAssistantId;
const activeChats = new Map();
let botReadyTimestamp = null;

// Função para interagir com o assistente e processar a mensagem recebida
async function handleIncomingMessage(message) {
    const content = message.body;

    try {
        // Se o conteúdo da mensagem for uma ordem de serviço, encaminhe para a API
        if (content.startsWith('/criar') || content.startsWith('/atualizar') || content.startsWith('/deletar') || content.startsWith('/ordemid') || content.startsWith('/ordem')) {
            const response = await handleOrderServiceCommand(content);
            await message.reply(response);
            return;
        }

        // Cria uma sessão de chat com o assistente
        const thread = activeChats.get(message.from) || await openai.beta.threads.create();
        activeChats.set(message.from, thread);

        // Envia a mensagem para o assistente
        await openai.beta.threads.messages.create(thread.id, {
            role: 'user',
            content: content,
        });

        // Executa a interação com o assistente
        const run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: assistantId,
        });

        // Aguarda até que a resposta do assistente esteja pronta
        const messages = await checkRunStatus(thread.id, run.id);

        // Verifica se o conteúdo é do tipo texto e responde no WhatsApp
        const respostaContent = messages.data[0]?.content[0];
        if (respostaContent && 'text' in respostaContent) {
            const respostaAI = respostaContent.text.value;
            await message.reply(respostaAI);
        } else {
            await message.reply('O assistente não conseguiu processar sua mensagem. Tente novamente.');
        }
    } catch (error) {
        console.error('Erro ao processar a mensagem:', error);
        await message.reply('Erro ao processar a mensagem. Tente novamente mais tarde.');
    }
}

function parseOrderDetails(content) {
    const details = {};
    const regexMap = {
        tipo_servico: /tipo de serviço:\s*([^,]+)/i,
        nome_cliente: /nome do cliente:\s*([^,]+)/i,
        endereco_cliente: /endereço:\s*([^,]+)/i,
        data_hora_agendados: /data e hora agendados:\s*([^,]+)/i,
        hora: /hora:\s*([^,]+)/i,
        descricao_servico: /descrição do serviço:\s*([^,]+)/i,
        funcionario_responsavel: /funcionário responsável:\s*([^,]+)/i,
        status: /status:\s*([^,]+)/i,
    };

    for (const [key, regex] of Object.entries(regexMap)) {
        const match = content.match(regex);
        if (match) {
            details[key] = match[1].trim(); // Remove espaços extras
        }
    }

    return details;
}

// Função para enviar comandos de ordem de serviço para a API
async function handleOrderServiceCommand(content) {
    let responseMessage;

    if (content.startsWith('/criar')) {
        const orderDetails = parseOrderDetails(content.split('/criar ')[1]);
        responseMessage = await sendOrderService(orderDetails);
    } else if (content.startsWith('/ordemid')) {
        const orderId = content.split('/ordemid ')[1];
        responseMessage = await getOrderService(orderId);
    } else if (content.startsWith('/atualizar')) {
        const [orderId, detailsText] = content.split('/atualizar ')[1].split(' ');
        const parsedDetails = parseOrderDetails(detailsText);
        responseMessage = await updateOrderService(orderId, parsedDetails);
    } else if (content.startsWith('/deletar')) {
        const orderId = content.split('/deletar ')[1];
        responseMessage = await deleteOrderService(orderId);
    }else if (content.startsWith('/ordem')) {
        responseMessage = await getAllOrderServices();
        
    } else {
        responseMessage = 'Comando de ordem de serviço não reconhecido. Tente novamente.';
    }

    return responseMessage;
}

// Funções CRUD para ordens de serviço usando axios
async function sendOrderService(orderDetails) {
    try {
        const response = await axios.post('http://127.0.0.1:8000/ordens-servico', {
            tipo_servico: orderDetails.tipo_servico,
            nome_cliente: orderDetails.nome_cliente,
            endereco_cliente: orderDetails.endereco_cliente,
            data_hora_agendados: orderDetails.data_hora_agendados,
            hora: orderDetails.hora,
            descricao_servico: orderDetails.descricao_servico,
            funcionario_responsavel: orderDetails.funcionario_responsavel,
            status: orderDetails.status
        });

        return `Ordem de Serviço criada com sucesso! ID: ${response.data.id}`;
    } catch (error) {
        console.error('Erro ao criar ordem de serviço:', error);
        return 'Erro ao criar a ordem de serviço. Verifique os detalhes e tente novamente.';
    }
}

async function getOrderService(orderId) {
    try {
        const response = await axios.get(`http://127.0.0.1:8000/ordens-servico/${orderId}`);
        return `Detalhes da Ordem de Serviço: ${JSON.stringify(response.data)}`;
    } catch (error) {
        console.error('Erro ao buscar ordem de serviço:', error);
        return 'Erro ao buscar a ordem de serviço. Verifique o ID e tente novamente.';
    }
}

async function updateOrderService(orderId, orderDetails) {
    try {
        await axios.put(`http://127.0.0.1:8000/ordens-servico/${orderId}`, orderDetails);
        return `Ordem de serviço ${orderId} atualizada com sucesso.`;
    } catch (error) {
        console.error('Erro ao atualizar ordem de serviço:', error);
        return 'Erro ao atualizar a ordem de serviço. Verifique os detalhes.';
    }
}

async function deleteOrderService(orderId) {
    try {
        await axios.delete(`http://127.0.0.1:8000/ordens-servico/${orderId}`);
        return `Ordem de serviço ${orderId} excluída com sucesso.`;
    } catch (error) {
        console.error('Erro ao excluir ordem de serviço:', error);
        return 'Erro ao excluir a ordem de serviço. Verifique o ID.';
    }
}

async function getAllOrderServices() {
    try {
        const response = await axios.get(`http://127.0.0.1:8000/ordens-servico`);
        return `Detalhes da Ordem de Serviço: ${JSON.stringify(response.data)}`;
    } catch (error) {
        console.error('Erro ao buscar ordem de serviço:', error);
        return 'Erro ao buscar a ordem de serviço. Verifique o ID e tente novamente.';
    }
}

// Função para verificar o status da resposta do OpenAI
async function checkRunStatus(threadId, runId) {
    return await new Promise((resolve) => {
        const verify = async () => {
            const runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);

            if (runStatus.status === 'completed') {
                const messages = await openai.beta.threads.messages.list(threadId);
                resolve(messages);
            } else {
                setTimeout(verify, 3000);
            }
        };
        verify();
    });
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
        botReadyTimestamp = new Date();
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

export { botReadyTimestamp, start };
