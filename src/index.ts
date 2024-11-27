// index.js
import express from 'express';
import { start, qrEmitter } from './whatsAppBot';
import config from './config';
import qrcode from 'qrcode';

const app = express();

const PORT = process.env.NODE_DOCKER_PORT || 8080;

// Variável para armazenar o último QR Code recebido
let currentQRCode = null;

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
        // Gerar um buffer de imagem PNG a partir do QR Code
        const qrImage = await qrcode.toBuffer(currentQRCode, { type: 'png' });

        // Definir o tipo de conteúdo como imagem PNG
        res.type('png');
        res.send(qrImage);
    } catch (error) {
        console.error('Erro ao gerar a imagem do QR Code:', error);
        res.status(500).json({ message: 'Erro ao gerar o QR Code.' });
    }
});

// Iniciar o servidor Express
app.listen(PORT, () => {
    console.log(`Servidor Express ouvindo na porta ${PORT}`);
});

// Iniciar o bot do WhatsApp
start();
