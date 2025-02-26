import express from 'express';
import { start, qrEmitter, findOrCreateThread } from './whatsAppBot';
import { Thread } from './database';
import config from './config';
import qrcode from 'qrcode';

const app = express();
app.use(express.json());

const PORT = process.env.NODE_DOCKER_PORT || 8080;

// Variável para armazenar o último QR Code recebido
let currentQRCode: string | null = null;

// Escutar eventos de QR Code emitidos pelo WhatsApp Bot
qrEmitter.on('qr', (qr) => {
    currentQRCode = qr;
    console.log('QR Code atualizado.');
});

// Rota principal
app.get('/', (req, res) => {
    return res.status(200).json({ message: `${config.botName} The AI Companion` });
});

// Rota para servir o QR Code como imagem PNG
app.get('/qrcode', async (req, res) => {
    if (!currentQRCode) {
        return res.status(404).json({ message: 'QR Code não disponível no momento.' });
    }

    try {
        const qrImage = await qrcode.toBuffer(currentQRCode, { type: 'png' });
        res.type('png');
        res.send(qrImage);
    } catch (error) {
        console.error('Erro ao gerar a imagem do QR Code:', error);
        res.status(500).json({ message: 'Erro ao gerar o QR Code.' });
    }
});

// Endpoint para pausar uma conversa (atualiza o campo "paused" no banco)
app.post('/conversation/:id/pause', async (req, res) => {
    try {
        const conversationId = req.params.id;
        // Utiliza o findOrCreateThread para garantir que a conversa exista
        const thread = await findOrCreateThread(conversationId);
        thread.set('paused', true);
        await thread.save();
        console.log(`Conversa ${conversationId} pausada.`);
        res.status(200).json({ message: `Conversa ${conversationId} foi pausada.` });
    } catch (error) {
        console.error('Erro ao pausar a conversa:', error);
        res.status(500).json({ message: 'Erro ao pausar a conversa.' });
    }
});

// Endpoint para retomar uma conversa
app.post('/conversation/:id/resume', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const thread = await Thread.findOne({ where: { identifier: conversationId } });
        if (!thread) {
            return res.status(404).json({ message: `Conversa ${conversationId} não encontrada.` });
        }
        thread.set('paused', false);
        await thread.save();
        console.log(`Conversa ${conversationId} retomada.`);
        res.status(200).json({ message: `Conversa ${conversationId} foi retomada.` });
    } catch (error) {
        console.error('Erro ao retomar a conversa:', error);
        res.status(500).json({ message: 'Erro ao retomar a conversa.' });
    }
});

// Endpoint para verificar o status de uma conversa
app.get('/conversation/:id/status', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const thread = await Thread.findOne({ where: { identifier: conversationId } });
        if (!thread) {
            return res.status(404).json({ message: `Conversa ${conversationId} não encontrada.` });
        }
        res.status(200).json({ conversationId, paused: thread.get('paused') });
    } catch (error) {
        console.error('Erro ao consultar status da conversa:', error);
        res.status(500).json({ message: 'Erro ao consultar status da conversa.' });
    }
});

// Iniciar o servidor Express
app.listen(PORT, () => {
    console.log(`Servidor Express ouvindo na porta ${PORT}`);
});

// Iniciar o bot do WhatsApp
start();
