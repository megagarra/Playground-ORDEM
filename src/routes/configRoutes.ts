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

// Endpoint para configurar a URL base da API externa (versão simples mantida para compatibilidade)
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
    
    // Atualiza o serviço da API externa
    ExternalApiService.getInstance().setBaseUrl(API_BASE_URL);
    
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

// Configuração avançada da API externa
// Substitua esta parte no arquivo configRoutes.ts na função POST '/external-api/config'

router.post('/external-api/config', async (req, res) => {
  try {
    const { 
      baseUrl,
      timeout,
      maxRetries,
      retryDelay,
      enableCache,
      cacheTTL,
      logLevel,
      defaultHeaders
    } = req.body;
    
    // Corrigindo a declaração do array com tipo explícito
    const updates: string[] = [];
    
    // Validação e configuração da URL base
    if (baseUrl !== undefined) {
      try {
        // Validação simples da URL
        new URL(baseUrl);
        
        // Salva no banco de dados
        await setConfig('API_BASE_URL', baseUrl);
        updates.push('URL base');
        
        // Atualiza o serviço
        ExternalApiService.getInstance().setBaseUrl(baseUrl);
      } catch (e) {
        return res.status(400).json({ 
          success: false, 
          message: 'URL base inválida. Por favor, forneça uma URL completa (ex: https://api.exemplo.com).'
        });
      }
    }
    
    // Configura o timeout
    if (timeout !== undefined) {
      if (typeof timeout !== 'number' || timeout < 0) {
        return res.status(400).json({
          success: false,
          message: 'Timeout inválido. Deve ser um número positivo em milissegundos.'
        });
      }
      
      await setConfig('API_TIMEOUT', String(timeout));
      updates.push('timeout');
    }
    
    // Configura retries
    if (maxRetries !== undefined) {
      if (typeof maxRetries !== 'number' || maxRetries < 0) {
        return res.status(400).json({
          success: false,
          message: 'Número máximo de retentativas inválido. Deve ser um número não-negativo.'
        });
      }
      
      await setConfig('API_MAX_RETRIES', String(maxRetries));
      updates.push('retentativas máximas');
    }
    
    // Configura delay entre retries
    if (retryDelay !== undefined) {
      if (typeof retryDelay !== 'number' || retryDelay < 0) {
        return res.status(400).json({
          success: false,
          message: 'Delay de retentativa inválido. Deve ser um número positivo em milissegundos.'
        });
      }
      
      await setConfig('API_RETRY_DELAY', String(retryDelay));
      updates.push('delay de retentativa');
    }
    
    // Configura cache
    if (enableCache !== undefined) {
      await setConfig('API_ENABLE_CACHE', enableCache ? 'true' : 'false');
      updates.push('cache ' + (enableCache ? 'habilitado' : 'desabilitado'));
    }
    
    // Configura TTL do cache
    if (cacheTTL !== undefined) {
      if (typeof cacheTTL !== 'number' || cacheTTL < 0) {
        return res.status(400).json({
          success: false,
          message: 'TTL de cache inválido. Deve ser um número positivo em milissegundos.'
        });
      }
      
      await setConfig('API_CACHE_TTL', String(cacheTTL));
      updates.push('TTL do cache');
    }
    
    // Configura nível de log
    if (logLevel !== undefined) {
      const validLevels = ['none', 'error', 'warn', 'info', 'debug'];
      if (!validLevels.includes(logLevel)) {
        return res.status(400).json({
          success: false,
          message: `Nível de log inválido. Deve ser um dos seguintes: ${validLevels.join(', ')}`
        });
      }
      
      await setConfig('API_LOG_LEVEL', logLevel);
      updates.push('nível de log');
      
      // Atualiza o serviço
      ExternalApiService.getInstance().setLogLevel(logLevel as any);
    }
    
    // Configura headers padrão
    if (defaultHeaders !== undefined) {
      if (typeof defaultHeaders !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Headers padrão inválidos. Deve ser um objeto com pares chave-valor.'
        });
      }
      
      await setConfig('API_DEFAULT_HEADERS', JSON.stringify(defaultHeaders));
      updates.push('headers padrão');
    }
    
    // Atualiza o cache de configuração
    await refreshConfigCache();
    await refreshConfig();
    
    // Atualiza o serviço da API externa com todas as configurações
    ExternalApiService.getInstance().updateConfig({
      baseUrl: config.API_BASE_URL,
      timeout: config.API_TIMEOUT ? parseInt(config.API_TIMEOUT) : undefined,
      maxRetries: config.API_MAX_RETRIES ? parseInt(config.API_MAX_RETRIES) : undefined,
      retryDelay: config.API_RETRY_DELAY ? parseInt(config.API_RETRY_DELAY) : undefined,
      logLevel: config.API_LOG_LEVEL as any,
      cache: {
        enabled: config.API_ENABLE_CACHE === 'true',
        ttl: config.API_CACHE_TTL ? parseInt(config.API_CACHE_TTL) : 60000
      },
      defaultHeaders: config.API_DEFAULT_HEADERS ? JSON.parse(config.API_DEFAULT_HEADERS) : undefined
    });
    
    return res.json({
      success: true,
      message: `Configuração da API externa atualizada com sucesso: ${updates.join(', ')}`,
      config: {
        baseUrl: config.API_BASE_URL,
        timeout: config.API_TIMEOUT,
        maxRetries: config.API_MAX_RETRIES,
        retryDelay: config.API_RETRY_DELAY,
        enableCache: config.API_ENABLE_CACHE,
        cacheTTL: config.API_CACHE_TTL,
        logLevel: config.API_LOG_LEVEL,
        defaultHeaders: config.API_DEFAULT_HEADERS ? JSON.parse(config.API_DEFAULT_HEADERS) : undefined
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

/**
 * Endpoint para adicionar mapeamentos personalizados de função para endpoint
 */
/**
 * Endpoint para adicionar mapeamentos personalizados de função para endpoint
 */
router.post('/external-api/mappings', async (req, res) => {
  try {
    const { mappings } = req.body;
    
    if (!Array.isArray(mappings)) {
      return res.status(400).json({
        success: false,
        message: 'Formato inválido. Esperado um array de mapeamentos.'
      });
    }
    
    // Salva os mapeamentos atuais
    const currentMappingsStr = await getConfig('API_FUNCTION_MAPPINGS');
    // Especifique o tipo explicitamente para evitar erros de 'never'
    const currentMappings: Array<{functionName: string, path: string, method?: string}> = 
      currentMappingsStr ? JSON.parse(currentMappingsStr) : [];
    
    // Adiciona os novos mapeamentos ou atualiza os existentes
    for (const mapping of mappings) {
      const { functionName, path, method } = mapping;
      
      if (!functionName || !path) {
        return res.status(400).json({
          success: false,
          message: 'Cada mapeamento deve ter pelo menos functionName e path definidos.'
        });
      }
      
      // Atualiza o mapeamento existente ou adiciona um novo
      const existingIndex = currentMappings.findIndex((m) => m.functionName === functionName);
      if (existingIndex >= 0) {
        currentMappings[existingIndex] = mapping;
      } else {
        currentMappings.push(mapping);
      }
      
      // Atualiza o serviço da API externa
      ExternalApiService.getInstance().addEndpointMapping(
        functionName, 
        path, 
        method || 'POST'
      );
    }
    
    // Salva os mapeamentos atualizados no banco de dados
    await setConfig('API_FUNCTION_MAPPINGS', JSON.stringify(currentMappings));
    
    return res.json({
      success: true,
      message: `${mappings.length} mapeamento(s) adicionado(s) ou atualizado(s) com sucesso.`,
      mappings: currentMappings
    });
  } catch (error: any) {
    console.error('Erro ao configurar mapeamentos de função:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Erro ao configurar mapeamentos de função: ${error.message}` 
    });
  }
});

/**
 * Endpoint para limpar o cache da API externa
 */
router.post('/external-api/clear-cache', async (req, res) => {
  try {
    ExternalApiService.getInstance().clearCache();
    
    return res.json({
      success: true,
      message: 'Cache da API externa limpo com sucesso.'
    });
  } catch (error: any) {
    console.error('Erro ao limpar cache da API externa:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Erro ao limpar cache da API externa: ${error.message}` 
    });
  }
});

// Endpoint para testar a API externa (versão melhorada)
router.post('/test-api', async (req, res) => {
  try {
    const { 
      path, 
      method = 'GET', 
      data, 
      functionName,
      functionArgs,
      auth,
      headers,
      timeout,
      skipCache
    } = req.body;
    
    console.log('[DEBUG] 🔍 /test-api - Requisição recebida:');
    console.log('[DEBUG] 📬 Body completo:', JSON.stringify(req.body, null, 2));

    // Verifica se a URL base está configurada
    const baseUrl = ExternalApiService.getInstance().getBaseUrl();
    console.log(`[DEBUG] 🔧 /test-api - URL base configurada: ${baseUrl || 'não configurada'}`);
    
    if (!baseUrl) {
      console.log('[DEBUG] ⚠️ /test-api - URL base não configurada, retornando erro');
      return res.status(400).json({
        success: false,
        message: 'URL base da API externa não configurada. Configure em Configurações > API_BASE_URL.',
        instrucoes: 'Para configurar a URL base, envie um POST para /config/external-api/config com o body {"baseUrl": "https://sua-api.com"}'
      });
    }

    // Preparação dos dados a serem enviados
    let apiResponse;

    // Se foi especificado um nome de função, executa como uma chamada de função
    if (functionName) {
      console.log(`[DEBUG] 🔧 /test-api - Testando função: "${functionName}"`);
      console.log(`Testando chamada de função: ${functionName}`);
      
      // Prepara os argumentos como uma string JSON
      const argsStr = JSON.stringify(functionArgs || {});
      
      // Executa a chamada de função
      apiResponse = await ExternalApiService.getInstance().executeFunctionCall({
        name: functionName,
        arguments: argsStr
      });
    } else {
      // Modo direto: usa os parâmetros path/method/data diretamente
      console.log(`[DEBUG] 🔧 /test-api - Modo direto: PATH=${path}, METHOD=${method}`);
      console.log(`Testando chamada direta à API: ${method} ${path}`);
      
      // Faz a chamada diretamente
      apiResponse = await ExternalApiService.getInstance().callExternalApi(
        path,
        method,
        data,
        {
          auth,
          headers,
          timeout,
          skipCache
        }
      );
    }
    
    console.log(`[DEBUG] ✅ /test-api - Chamada bem-sucedida`);
    console.log(`[DEBUG] 📥 /test-api - Resposta:`, JSON.stringify(apiResponse, null, 2));
    
    return res.json({
      success: true,
      message: `Chamada à API externa bem-sucedida`,
      result: apiResponse
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