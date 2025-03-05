import axios, { AxiosRequestConfig } from 'axios';
import config from '../config';

/**
 * Serviço para chamadas à APIs externas
 * Funciona como um proxy genérico para qualquer API
 */
export class ExternalApiService {
  static baseUrl: string | null = process.env.API_BASE_URL || null;

  /**
   * Define a URL base para a API externa
   * @param url URL base da API
   */
  static setBaseUrl(url: string) {
    console.log(`[DEBUG] 🔧 ExternalApiService - Definindo URL base: ${url}`);
    this.baseUrl = url;
  }

  /**
   * Obtém a URL completa para um caminho da API
   * @param path Caminho relativo da API
   * @returns URL completa
   */
  static getApiUrl(path: string): string {
    // Verificar se a URL base está configurada
    const baseUrlFromConfig = config.API_BASE_URL;
    
    if (baseUrlFromConfig) {
      // Se estiver no config, use-a e atualize também o valor estático para manter sincronizado
      this.baseUrl = baseUrlFromConfig;
      console.log(`[DEBUG] 🔄 getApiUrl - Usando URL base da configuração: ${baseUrlFromConfig}`);
    }
    
    if (!this.baseUrl) {
      console.log('[DEBUG] ⚠️ getApiUrl - URL base não configurada, usando localhost:3000');
      return `http://localhost:3000/${path}`; // URL padrão para desenvolvimento
    }

    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /**
   * Mapeia um nome de função e argumentos para um endpoint de API
   * Esta função é genérica e simplesmente usa o que for informado nos argumentos
   * ou converte o nome da função em um formato de URL
   * 
   * @param functionName Nome da função chamada pelo assistente
   * @param args Argumentos passados pelo assistente
   * @returns Objeto com path e method para a chamada à API
   */
  static mapFunctionToEndpoint(functionName: string, args: any = {}): { path: string; method: string } {
    console.log(`[DEBUG] 🔍 mapFunctionToEndpoint - Função chamada: "${functionName}"`);
    console.log(`[DEBUG] 🔍 mapFunctionToEndpoint - Argumentos:`, JSON.stringify(args, null, 2));

    // Verificar se o path/url/endpoint foi fornecido diretamente nos argumentos
    let path = args.path || args.url || args.endpoint || '';
    let method = args.method || args.http_method || 'POST';
    
    // Se não foi fornecido um path, converter o nome da função para um formato de URL
    if (!path) {
      path = functionName.replace(/_/g, '-');
      console.log(`[DEBUG] 🔧 mapFunctionToEndpoint - Nenhum path explícito, usando nome da função como path: ${path}`);
    } else {
      console.log(`[DEBUG] 🔧 mapFunctionToEndpoint - Usando path definido nos argumentos: ${path}`);
    }

    console.log(`[DEBUG] ✅ mapFunctionToEndpoint - Mapeamento definido: PATH=${path}, METHOD=${method}`);
    console.log(`[DEBUG] 🗺️ Mapeamento: ${functionName} => PATH: ${path}, METHOD: ${method}`);
    
    return { path, method };
  }

  /**
   * Valida e limpa os dados de requisição
   * Remove parâmetros especiais e faz correções necessárias
   * 
   * @param functionName Nome da função chamada
   * @param method Método HTTP
   * @param data Dados a serem validados
   * @returns Dados validados e limpos
   */
  static validateRequestData(functionName: string, method: string, data?: any): any {
    console.log(`[DEBUG] 🔍 validateRequestData - Validando dados para: ${functionName}, método: ${method}`);
    
    if (!data) {
      console.log(`[DEBUG] ℹ️ validateRequestData - Sem dados para validar`);
      return {};
    }
    
    console.log(`[DEBUG] 📤 validateRequestData - Dados originais:`, JSON.stringify(data || {}, null, 2));
    
    // Criamos uma cópia dos dados para não modificar o objeto original
    let validatedData = { ...data };
    
    // Removemos os parâmetros especiais que não devem ser enviados para a API
    const specialParams = ['path', 'url', 'endpoint', 'method', 'http_method'];
    specialParams.forEach(param => {
      if (validatedData[param] !== undefined) {
        delete validatedData[param];
      }
    });
    
    // Correção genérica para nomes de campos, convertendo palavras com terminação "ada" para "ado"
    // Isso ajuda com problemas como "data_hora_agendada" vs "data_hora_agendado"
    const fieldNames = Object.keys(validatedData);
    for (const fieldName of fieldNames) {
      if (fieldName.endsWith('ada') && !validatedData[fieldName.replace(/ada$/, 'ado')]) {
        console.log(`[DEBUG] 🔄 validateRequestData - Corrigindo campo ${fieldName} para ${fieldName.replace(/ada$/, 'ado')}`);
        validatedData[fieldName.replace(/ada$/, 'ado')] = validatedData[fieldName];
        delete validatedData[fieldName];
      }
    }
    
    console.log(`[DEBUG] 📤 validateRequestData - Dados após validação:`, JSON.stringify(validatedData, null, 2));
    return validatedData;
  }

  /**
   * Realiza a chamada à API externa
   * @param path Caminho relativo da API
   * @param method Método HTTP a ser usado
   * @param data Dados a serem enviados
   * @param functionName Nome da função para logs
   * @returns Resposta da API
   */
  static async callExternalApi(path: string, method: string, data?: any, functionName?: string) {
    // Verificar se a URL base está configurada
    const baseUrlFromConfig = config.API_BASE_URL;
    
    if (baseUrlFromConfig) {
      this.baseUrl = baseUrlFromConfig;
      console.log(`[DEBUG] 🔄 callExternalApi - Usando URL base da configuração: ${baseUrlFromConfig}`);
    }
    
    if (!this.baseUrl) {
      console.log('[DEBUG] ❌ callExternalApi - URL base da API externa não configurada');
      throw new Error('URL base da API externa não configurada');
    }

    const apiUrl = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    
    console.log(`[DEBUG] 🔗 CHAMADA REAL - Detalhes:`);
    console.log(`[DEBUG]   - Path fornecido: "${path}"`);
    console.log(`[DEBUG]   - URL completa: "${apiUrl}"`);
    console.log(`[DEBUG]   - Método: ${method.toUpperCase()}`);
    console.log(`[DEBUG]   - Função: ${functionName || 'Não especificada'}`);
    console.log(`[DEBUG]   - Dados enviados:`, JSON.stringify(data, null, 2));
    
    // Se temos o nome da função, validamos os dados
    if (functionName) {
      console.log(`[DEBUG] 🔍 Validando dados para função: ${functionName}`);
      // Validar e limpar os dados, removendo parâmetros especiais
      data = this.validateRequestData(functionName, method, data);
    }
    
    console.log(`[DEBUG] 🚀 Chamando API externa: ${method} ${apiUrl}`);
    console.log(`⚡ Chamando API externa com: ${method} ${apiUrl}`);
    if (data) {
      console.log('Dados:', JSON.stringify(data, null, 2));
    }

    try {
      console.log(`[DEBUG] 🌐 callExternalApi - Iniciando chamada: ${method} ${path}`);
      console.log(`[DEBUG] 🌐 callExternalApi - URL base configurada: ${this.baseUrl}`);
      
      if (data) {
        console.log(`[DEBUG] 🌐 callExternalApi - Dados a enviar:`, JSON.stringify(data, null, 2));
      }
      
      console.log(`[DEBUG] 🔗 callExternalApi - URL completa: ${apiUrl}`);
      
      // Log detalhado da chamada para facilitar depuração
      console.log(`=== CHAMADA API EXTERNA - INÍCIO ===`);
      console.log(`Método: ${method}`);
      console.log(`URL: ${apiUrl}`);
      console.log(`URL Base: ${this.baseUrl}`);
      console.log(`Caminho: ${path}`);
      if (data) {
        console.log(`Dados enviados:`);
        console.log(JSON.stringify(data, null, 2));
      }
      console.log(`Headers:`);
      console.log(JSON.stringify({
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'ExternalApiService/1.0'
      }, null, 2));

      // Configurações para a chamada
      const requestConfig: AxiosRequestConfig = {
        method,
        url: apiUrl,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'ExternalApiService/1.0'
        }
      };

      // Adiciona corpo da requisição para POST e PUT
      if ((['POST', 'PUT'].includes(method.toUpperCase())) && data) {
        requestConfig.data = data;
      }

      console.log(`[DEBUG] 🚀 callExternalApi - Executando requisição ${method} para ${apiUrl}`);
      const response = await axios(requestConfig);

      console.log(`[DEBUG] ✅ callExternalApi - Resposta recebida:`, JSON.stringify(response.data, null, 2));
      console.log(`=== CHAMADA API EXTERNA - SUCESSO ===`);
      console.log(`Status: ${response.status}`);
      console.log(`Dados recebidos: ${JSON.stringify(response.data, null, 2)}`);

      return response.data;
    } catch (error: any) {
      console.error(`[DEBUG] ❌ callExternalApi - Erro na chamada API:`, error.message);
      console.error(`=== ERRO NA CHAMADA API EXTERNA ===`);
      console.error(`Mensagem: ${error.message}`);

      // Se for um erro da API com resposta, mostra os detalhes
      if (error.response) {
        console.error(`[DEBUG] ❌ Status HTTP: ${error.response.status}`);
        console.error(`Status: ${error.response.status}`);
        console.error(`Dados: ${JSON.stringify(error.response.data)}`);
        console.error(`Headers: ${JSON.stringify(error.response.headers)}`);
        
        // Adicionando logs específicos para erros 422 (validação)
        if (error.response.status === 422) {
          console.error(`[DEBUG] 🔍 ERRO DE VALIDAÇÃO 422 - Detalhes:`);
          console.error(`[DEBUG]   - URL chamada: ${apiUrl}`);
          console.error(`[DEBUG]   - Método: ${method}`);
          console.error(`[DEBUG]   - Dados enviados:`, JSON.stringify(data, null, 2));
          console.error(`[DEBUG]   - Resposta de erro:`, JSON.stringify(error.response.data, null, 2));
        }
        
        throw new Error(`Erro ${error.response.status} ao chamar API externa: ${error.response.data?.message || error.message}`);
      } else if (error.request) {
        // A requisição foi feita mas não houve resposta
        console.error('[DEBUG] ❌ Sem resposta do servidor');
        console.error('Sem resposta do servidor');
        console.error(`Requisição: ${JSON.stringify(error.request)}`);
        throw new Error(`Sem resposta do servidor ao chamar API externa: ${error.message}`);
      } else {
        // Erro na configuração da requisição
        console.error('[DEBUG] ❌ Erro ao configurar requisição');
        console.error('Erro ao configurar requisição');
        throw new Error(`Erro ao configurar requisição para API externa: ${error.message}`);
      }
    }
  }
} 