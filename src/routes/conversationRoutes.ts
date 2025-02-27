// src/routes/conversationRoutes.ts
import express from 'express';
import { Thread, ThreadMessage, db } from '../database';
import { Op } from 'sequelize';
import { findOrCreateThread } from '../whatsAppBot';

const router = express.Router();

// Listar todas as conversas (com paginação)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    
    let whereCondition = {};
    if (search) {
      whereCondition = {
        [Op.or]: [
          { identifier: { [Op.iLike]: `%${search}%` } }
        ]
      };
    }
    
    const { count, rows } = await Thread.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });
    
    res.status(200).json({
      success: true,
      data: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
        conversations: rows
      }
    });
  } catch (error) {
    console.error('Erro ao listar conversas:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar conversas.' });
  }
});

// Obter detalhes de uma conversa específica incluindo mensagens
router.get('/:id', async (req, res) => {
  try {
    const identifier = req.params.id;
    
    // Busca a thread no banco
    const thread = await Thread.findOne({ 
      where: { identifier },
    });
    
    if (!thread) {
      return res.status(404).json({ success: false, message: `Conversa ${identifier} não encontrada.` });
    }
    
    // Busca as mensagens da thread
    const messages = await ThreadMessage.findAll({
      where: { thread_id: thread.id },
      order: [['createdAt', 'ASC']]
    });
    
    res.status(200).json({
      success: true,
      data: {
        thread,
        messages
      }
    });
  } catch (error) {
    console.error(`Erro ao buscar detalhes da conversa ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Erro ao buscar detalhes da conversa.' });
  }
});

// Criar uma nova conversa
router.post('/', async (req, res) => {
  try {
    const { identifier, medium = 'whatsapp' } = req.body;
    
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'O identificador da conversa é obrigatório.' });
    }
    
    // Verifica se já existe
    const existingThread = await Thread.findOne({ where: { identifier } });
    if (existingThread) {
      return res.status(409).json({ success: false, message: `Conversa com identificador ${identifier} já existe.` });
    }
    
    // Usar a função findOrCreateThread para garantir que a thread seja criada tanto 
    // no banco quanto na OpenAI
    const thread = await findOrCreateThread(identifier);
    
    res.status(201).json({
      success: true,
      message: `Conversa ${identifier} criada com sucesso.`,
      data: thread
    });
  } catch (error) {
    console.error('Erro ao criar conversa:', error);
    res.status(500).json({ success: false, message: 'Erro ao criar conversa.' });
  }
});

// Pausar uma conversa
// Substituir o endpoint de pausa em src/routes/conversationRoutes.ts

// Pausar uma conversa
router.post('/:id/pause', async (req, res) => {
  try {
    const identifier = req.params.id;
    console.log(`Solicitação para pausar conversa ${identifier}`);
    
    // Busca a thread diretamente do banco
    let thread = await Thread.findOne({ where: { identifier } });
    
    if (!thread) {
      console.log(`Thread ${identifier} não encontrada, criando nova...`);
      // Se não existir, cria uma nova usando findOrCreateThread
      thread = await findOrCreateThread(identifier);
    }
    
    console.log(`Estado atual da thread ${identifier}: paused=${thread.paused}`);
    
    // Atualiza diretamente usando o método update do Sequelize
    const [updated] = await Thread.update(
      { paused: true },
      { where: { id: thread.id } }
    );
    
    console.log(`Resultado da atualização: ${updated} registro(s) afetado(s)`);
    
    // Força atualização do objeto thread com os novos valores
    thread = await Thread.findByPk(thread.id);
    
    // Limpa o cache de threads para garantir que a próxima consulta pegue valores atualizados
    if (global.threadCache && global.threadCache.delete) {
      global.threadCache.delete(identifier);
      console.log(`Thread ${identifier} removida do cache`);
    }
    
    res.status(200).json({
      success: true,
      message: `Conversa ${identifier} foi pausada.`,
      data: { paused: thread.paused }
    });
  } catch (error) {
    console.error(`Erro ao pausar conversa ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Erro ao pausar conversa.' });
  }
});

// Endpoint similar para retomar conversa
router.post('/:id/resume', async (req, res) => {
  try {
    const identifier = req.params.id;
    console.log(`Solicitação para retomar conversa ${identifier}`);
    
    // Busca a thread diretamente do banco
    let thread = await Thread.findOne({ where: { identifier } });
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: `Conversa ${identifier} não encontrada.` 
      });
    }
    
    console.log(`Estado atual da thread ${identifier}: paused=${thread.paused}`);
    
    // Atualiza diretamente usando o método update do Sequelize
    const [updated] = await Thread.update(
      { paused: false },
      { where: { id: thread.id } }
    );
    
    console.log(`Resultado da atualização: ${updated} registro(s) afetado(s)`);
    
    // Força atualização do objeto thread com os novos valores
    thread = await Thread.findByPk(thread.id);
    
    // Limpa o cache de threads para garantir que a próxima consulta pegue valores atualizados
    if (global.threadCache && global.threadCache.delete) {
      global.threadCache.delete(identifier);
      console.log(`Thread ${identifier} removida do cache`);
    }
    
    res.status(200).json({
      success: true,
      message: `Conversa ${identifier} foi retomada.`,
      data: { paused: thread.paused }
    });
  } catch (error) {
    console.error(`Erro ao retomar conversa ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Erro ao retomar conversa.' });
  }
});

// Obter status de uma conversa
router.get('/:id/status', async (req, res) => {
  try {
    const identifier = req.params.id;
    
    // Força busca direta no banco de dados, ignorando cache
    const thread = await Thread.findOne({ 
      where: { identifier },
      rejectOnEmpty: false  // Não lança erro se não encontrar
    });
    
    if (!thread) {
      return res.status(404).json({ 
        success: false, 
        message: `Conversa ${identifier} não encontrada.` 
      });
    }
    
    console.log(`Status atual da conversa ${identifier}: paused=${thread.paused}`);
    
    res.status(200).json({
      success: true,
      data: {
        identifier,
        paused: thread.paused,
        openai_thread_id: thread.openai_thread_id,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      }
    });
  } catch (error) {
    console.error(`Erro ao consultar status da conversa ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao consultar status da conversa.' 
    });
  }
});

// Adicionar uma mensagem a uma conversa (permitindo simular conversa manualmente)
router.post('/:id/messages', async (req, res) => {
  try {
    const identifier = req.params.id;
    const { content, role = 'user' } = req.body;
    
    if (!content) {
      return res.status(400).json({ success: false, message: 'O conteúdo da mensagem é obrigatório.' });
    }
    
    // Verifica se a role é válida
    if (!['user', 'assistant'].includes(role)) {
      return res.status(400).json({ success: false, message: 'A role deve ser "user" ou "assistant".' });
    }
    
    // Busca a thread
    const thread = await Thread.findOne({ where: { identifier } });
    if (!thread) {
      return res.status(404).json({ success: false, message: `Conversa ${identifier} não encontrada.` });
    }
    
    // Cria a mensagem
    const message = await ThreadMessage.create({
      thread_id: thread.id as number,
      role,
      content
    });
    
    res.status(201).json({
      success: true,
      message: 'Mensagem adicionada com sucesso.',
      data: message
    });
  } catch (error) {
    console.error(`Erro ao adicionar mensagem à conversa ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Erro ao adicionar mensagem à conversa.' });
  }
});

// Excluir uma conversa
router.delete('/:id', async (req, res) => {
  try {
    const identifier = req.params.id;
    
    const thread = await Thread.findOne({ where: { identifier } });
    if (!thread) {
      return res.status(404).json({ success: false, message: `Conversa ${identifier} não encontrada.` });
    }
    
    // Inicia uma transação para garantir a integridade dos dados
    const t = await db.transaction();
    
    try {
      // Exclui todas as mensagens da thread
      await ThreadMessage.destroy({
        where: { thread_id: thread.id },
        transaction: t
      });
      
      // Exclui a thread
      await thread.destroy({ transaction: t });
      
      // Confirma a transação
      await t.commit();
      
      res.status(200).json({
        success: true,
        message: `Conversa ${identifier} excluída com sucesso.`
      });
    } catch (error) {
      // Reverte a transação em caso de erro
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error(`Erro ao excluir conversa ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Erro ao excluir conversa.' });
  }
});

// Obter métricas/estatísticas das conversas
router.get('/stats/metrics', async (req, res) => {
  try {
    // Total de conversas
    const totalConversations = await Thread.count();
    
    // Conversas ativas (não pausadas)
    const activeConversations = await Thread.count({ where: { paused: false } });
    
    // Conversas pausadas
    const pausedConversations = await Thread.count({ where: { paused: true } });
    
    // Total de mensagens
    const totalMessages = await ThreadMessage.count();
    
    // Mensagens por role
    const userMessages = await ThreadMessage.count({ where: { role: 'user' } });
    const assistantMessages = await ThreadMessage.count({ where: { role: 'assistant' } });
    
    // Conversas por dia nos últimos 7 dias
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const conversationsByDate = await Thread.findAll({
      attributes: [
        [db.fn('date_trunc', 'day', db.col('createdat')), 'date'],
        [db.fn('count', '*'), 'count']
      ],
      where: {
        createdAt: {
          [Op.gte]: sevenDaysAgo
        }
      },
      group: [db.fn('date_trunc', 'day', db.col('createdat'))],
      order: [[db.fn('date_trunc', 'day', db.col('createdat')), 'ASC']]
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalConversations,
        activeConversations,
        pausedConversations,
        totalMessages,
        messageBreakdown: {
          user: userMessages,
          assistant: assistantMessages
        },
        conversationsByDate: conversationsByDate.map(item => {
          const dateValue = item.get('date');
          const countValue = item.get('count');
          return {
            date: dateValue ? dateValue.toString() : null,
            count: countValue ? parseInt(countValue.toString()) : 0
          };
        })
      }
    });
  } catch (error) {
    console.error('Erro ao obter métricas das conversas:', error);
    res.status(500).json({ success: false, message: 'Erro ao obter métricas das conversas.' });
  }
});

// Buscar mensagens em todas as conversas (pesquisa global)
router.get('/search/messages', async (req, res) => {
  try {
    const query = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    if (!query) {
      return res.status(400).json({ success: false, message: 'O parâmetro de busca (q) é obrigatório.' });
    }
    
    // Busca mensagens que contêm o termo de busca
    const { count, rows } = await ThreadMessage.findAndCountAll({
      where: {
        content: {
          [Op.iLike]: `%${query}%`
        }
      },
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Thread,
          as: 'thread',
          attributes: ['identifier', 'medium', 'paused']
        }
      ]
    });
    
    res.status(200).json({
      success: true,
      data: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
        messages: rows
      }
    });
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar mensagens.' });
  }
});

export default router;