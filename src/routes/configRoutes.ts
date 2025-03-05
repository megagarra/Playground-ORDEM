// src/routes/configRoutes.ts
import express from 'express';
import { getConfig, getAllConfigs, setConfig, Config, refreshConfigCache } from '../database';
import { refreshConfig, config } from '../config';
import { ExternalApiService } from '../services/externalApi';

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

// Endpoint para configurar a URL base da API externa
router.post('/', async (req, res) => {
  try {
    const { API_BASE_URL } = req.body;
    
    // Verifica se a URL base foi fornecida
    if (!API_BASE_URL) {
      return res.status(400).json({ 
        success: false, 
        message: 'URL base da API externa não fornecida. Por favor, envie o parâmetro API_BASE_URL.'
      });
    }
    
    // Validação simples da URL
    try {
      new URL(API_BASE_URL);
    } catch (e) {
      return res.status(400).json({ 
        success: false, 
        message: 'URL base inválida. Por favor, forneça uma URL completa (ex: https://api.exemplo.com).'
      });
    }
    
    // Salva a configuração
    await setConfig('API_BASE_URL', API_BASE_URL);
    await refreshConfig();
    
    return res.json({
      success: true,
      message: `URL base da API externa configurada com sucesso: ${API_BASE_URL}`,
      config: {
        API_BASE_URL: config.API_BASE_URL
      },
      examples: {
        testApi: {
          url: '/config/test-api',
          method: 'POST',
          body: {
            functionName: 'create_order_service',
            functionArgs: {
              tipo_servico: "Elétrico",
              nome_cliente: "João Silva",
              endereco_cliente: "Rua ABC, 123",
              data_hora_agendado: "2023-10-20",
              hora: "14:00",
              descricao_servico: "Instalação de tomadas",
              funcionario_responsavel: "Carlos",
              status: "Pendente"
            }
          }
        }
      }
    });
  } catch (error: any) {
    console.error('Erro ao configurar API externa:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Erro ao configurar API externa: ${error.message}` 
    });
  }
});

// Endpoint para testar a API externa
router.post('/test-api', async (req, res) => {
  try {
    const { path, method, data, functionName, functionArgs } = req.body;
    console.log('[DEBUG] 🔍 /test-api - Requisição recebida:');
    console.log('[DEBUG] 📬 Body completo:', JSON.stringify(req.body, null, 2));

    // Verifica se a URL base está configurada
    console.log(`[DEBUG] 🔧 /test-api - URL base configurada: ${config.API_BASE_URL || 'não configurada'}`);
    if (!config.API_BASE_URL) {
      console.log('[DEBUG] ⚠️ /test-api - URL base não configurada, retornando erro');
      return res.status(400).json({
        success: false,
        message: 'URL base da API externa não configurada. Configure em Configurações > API_BASE_URL.',
        instrucoes: 'Para configurar a URL base, envie um POST para /config com o body {"API_BASE_URL": "https://sua-api.com"}'
      });
    }

    let apiPath, apiMethod, apiData;

    // Se foi especificado um nome de função, usa o mapeamento genérico
    if (functionName) {
      console.log(`[DEBUG] 🔧 /test-api - Testando função: "${functionName}"`);
      console.log(`Testando chamada de função: ${functionName}`);
      console.log(`[DEBUG] 🔧 /test-api - Argumentos da função:`, JSON.stringify(functionArgs, null, 2));

      // Verifica se o path está explícito nos argumentos e faz um log
      if (functionArgs?.path) {
        console.log(`[DEBUG] 🔍 /test-api - Path explícito nos argumentos: "${functionArgs.path}"`);
      } else if (functionArgs?.url) {
        console.log(`[DEBUG] 🔍 /test-api - URL explícita nos argumentos: "${functionArgs.url}"`);
      } else if (functionArgs?.endpoint) {
        console.log(`[DEBUG] 🔍 /test-api - Endpoint explícito nos argumentos: "${functionArgs.endpoint}"`);
      } else {
        console.log(`[DEBUG] 🔍 /test-api - Nenhum path/url/endpoint explícito nos argumentos, usando nome da função ou mapeamento`);
      }

      // Usa o mapeamento de funções para determinar o caminho e método
      const mapped = ExternalApiService.mapFunctionToEndpoint(functionName, functionArgs);
      apiPath = mapped.path;
      apiMethod = mapped.method;
      
      // Valida e limpa os dados
      apiData = ExternalApiService.validateRequestData(functionName, apiMethod, functionArgs);

      console.log(`[DEBUG] 🗺️ /test-api - Mapeamento: ${functionName} => PATH: ${apiPath}, METHOD: ${apiMethod}`);
      console.log(`[DEBUG] 📤 /test-api - Dados a enviar:`, JSON.stringify(apiData, null, 2));
    } else {
      // Modo direto: usa os parâmetros path/method/data diretamente
      console.log(`[DEBUG] 🔧 /test-api - Modo direto: PATH=${path}, METHOD=${method}`);
      console.log(`Testando chamada direta à API: ${method} ${path}`);
      
      apiPath = path;
      apiMethod = method || 'GET';
      apiData = data;
      
      console.log(`[DEBUG] 📤 /test-api - Dados a enviar:`, JSON.stringify(apiData, null, 2));
    }

    // Faz a chamada à API
    console.log(`[DEBUG] 🚀 /test-api - Chamando API: ${apiMethod} ${apiPath}`);
    const result = await ExternalApiService.callExternalApi(apiPath, apiMethod, apiData, functionName);
    
    console.log(`[DEBUG] ✅ /test-api - Chamada bem-sucedida`);
    console.log(`[DEBUG] 📥 /test-api - Resposta:`, JSON.stringify(result, null, 2));
    
    return res.json({
      success: true,
      message: `Chamada à API externa bem-sucedida: ${apiMethod} ${apiPath}`,
      path: apiPath,
      method: apiMethod,
      data: apiData,
      result
    });
  } catch (error: any) {
    console.error(`[DEBUG] ❌ /test-api - Erro na chamada:`, error.message);
    return res.status(500).json({ 
      success: false, 
      message: `Erro ao chamar API externa: ${error.message}` 
    });
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