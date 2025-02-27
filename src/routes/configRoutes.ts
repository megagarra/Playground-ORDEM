// src/routes/configRoutes.ts
import express from 'express';
import { getConfig, getAllConfigs, setConfig, Config, refreshConfigCache } from '../database';
import { refreshConfig } from '../config';

const router = express.Router();

// Obter todas as configurações
router.get('/', async (req, res) => {
  try {
    const configs = await getAllConfigs();
    
    // Opcionalmente, mascarar valores sensíveis
    const maskedConfigs = { ...configs };
    ['OPENAI_API_KEY', 'DATABASE_URL', 'REDIS_URL'].forEach(key => {
      if (maskedConfigs[key]) {
        const value = maskedConfigs[key];
        maskedConfigs[key] = `${value.substring(0, 3)}...${value.substring(value.length - 3)}`;
      }
    });
    
    res.status(200).json({ success: true, data: maskedConfigs });
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar configurações.' });
  }
});

// Obter uma configuração específica
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const value = await getConfig(key);
    
    if (value === null) {
      return res.status(404).json({ success: false, message: `Configuração '${key}' não encontrada.` });
    }
    
    // Mascarar valores sensíveis
    const isSensitive = ['OPENAI_API_KEY', 'DATABASE_URL', 'REDIS_URL'].includes(key);
    const responseValue = isSensitive 
      ? `${value.substring(0, 3)}...${value.substring(value.length - 3)}`
      : value;
    
    res.status(200).json({ success: true, data: { key, value: responseValue } });
  } catch (error) {
    console.error(`Erro ao buscar configuração '${req.params.key}':`, error);
    res.status(500).json({ success: false, message: 'Erro ao buscar configuração.' });
  }
});

// Atualizar ou criar uma configuração
router.post('/', async (req, res) => {
  try {
    const { key, value, description } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ success: false, message: 'Chave e valor são obrigatórios.' });
    }
    
    await setConfig(key, value, description);
    
    // Atualizar o cache de configuração
    await refreshConfigCache();
    await refreshConfig();
    
    res.status(200).json({ success: true, message: `Configuração '${key}' atualizada com sucesso.` });
  } catch (error) {
    console.error('Erro ao atualizar configuração:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar configuração.' });
  }
});

// Atualizar uma configuração existente por chave
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ success: false, message: 'Valor da configuração é obrigatório.' });
    }
    
    // Verificar se a configuração existe
    const existingConfig = await Config.findOne({ where: { key } });
    if (!existingConfig) {
      return res.status(404).json({ success: false, message: `Configuração '${key}' não encontrada.` });
    }
    
    // Atualiza a configuração
    existingConfig.value = value;
    if (description) existingConfig.description = description;
    await existingConfig.save();
    
    // Atualizar o cache de configuração
    await refreshConfigCache();
    await refreshConfig();
    
    res.status(200).json({ success: true, message: `Configuração '${key}' atualizada com sucesso.` });
  } catch (error) {
    console.error(`Erro ao atualizar configuração '${req.params.key}':`, error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar configuração.' });
  }
});

// Excluir uma configuração
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    // Verificar se a configuração existe
    const existingConfig = await Config.findOne({ where: { key } });
    if (!existingConfig) {
      return res.status(404).json({ success: false, message: `Configuração '${key}' não encontrada.` });
    }
    
    // Exclui a configuração
    await existingConfig.destroy();
    
    // Atualizar o cache de configuração
    await refreshConfigCache();
    await refreshConfig();
    
    res.status(200).json({ success: true, message: `Configuração '${key}' excluída com sucesso.` });
  } catch (error) {
    console.error(`Erro ao excluir configuração '${req.params.key}':`, error);
    res.status(500).json({ success: false, message: 'Erro ao excluir configuração.' });
  }
});

export default router;