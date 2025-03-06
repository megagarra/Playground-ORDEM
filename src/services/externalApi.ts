import axios, { AxiosRequestConfig, AxiosResponse, Method } from 'axios';
import config from '../config';

/**
 * Configuração de autenticação para chamadas de API
 */
export interface AuthConfig {
  type: 'none' | 'basic' | 'bearer' | 'api-key' | 'custom';
  username?: string;
  password?: string;
  token?: string;
  apiKey?: string;
  apiKeyHeaderName?: string;
  customHeaderName?: string;
  customHeaderValue?: string;
}

/**
 * Resposta padronizada da API
 */
export interface ApiResponse<T = any> {
  success: boolean;
  status: number;
  data: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  cached?: boolean;
}

/**
 * Opções para o sistema de cache
 */
export interface CacheOptions {
  enabled: boolean;
  ttl: number; // Tempo de vida em ms
}

/**
 * Configuração do cliente da API externa
 */
export interface ApiServiceConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  cache?: CacheOptions;
  maxRetries?: number;
  retryDelay?: number;
  logLevel?: 'none' | 'error' | 'warn' | 'info' | 'debug';
}

/**
 * Serviço para chamadas à APIs externas
 * Funciona como um proxy genérico para qualquer API
 */
export class ExternalApiService {
  static executeFunctionCall(arg0: { name: any; arguments: any; }) {
    throw new Error('Method not implemented.');
  }
  private static instance: ExternalApiService;
  private baseUrl: string | null = null;
  private defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'ExternalApiService/2.0'
  };
  private timeout: number = 30000;
  private cacheOptions: CacheOptions = {
    enabled: false,
    ttl: 60000 // 1 minuto
  };
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private maxRetries: number = 3;
  private retryDelay: number = 1000;
  private logLevel: 'none' | 'error' | 'warn' | 'info' | 'debug' = 'info';
  
  // Mapeamento para endpoints personalizados
  private endpointMappings: Record<string, { path: string, method: Method }> = {};

  /**
   * Construtor privado para garantir o padrão singleton
   */
  private constructor(options?: ApiServiceConfig) {
    this.baseUrl = process.env.API_BASE_URL || null;
    
    if (options) {
      if (options.baseUrl) this.baseUrl = options.baseUrl;
      if (options.defaultHeaders) this.defaultHeaders = { ...this.defaultHeaders, ...options.defaultHeaders };
      if (options.timeout) this.timeout = options.timeout;
      if (options.logLevel) this.logLevel = options.logLevel;
      if (options.maxRetries !== undefined) this.maxRetries = options.maxRetries;
      if (options.retryDelay !== undefined) this.retryDelay = options.retryDelay;
      
      if (options.cache) {
        this.cacheOptions = {
          ...this.cacheOptions,
          ...options.cache
        };
      }
    }
    
    this.log('debug', '🔧 ExternalApiService inicializado com sucesso');
  }
  
  /**
   * Obtém a instância singleton
   */
  public static getInstance(options?: ApiServiceConfig): ExternalApiService {
    if (!ExternalApiService.instance) {
      ExternalApiService.instance = new ExternalApiService(options);
    } else if (options) {
      // Atualiza as opções se fornecidas
      ExternalApiService.instance.updateConfig(options);
    }
    
    return ExternalApiService.instance;
  }

  /**
   * Atualiza a configuração do serviço
   */
  public updateConfig(options: ApiServiceConfig): void {
    if (options.baseUrl) this.baseUrl = options.baseUrl;
    if (options.defaultHeaders) this.defaultHeaders = { ...this.defaultHeaders, ...options.defaultHeaders };
    if (options.timeout) this.timeout = options.timeout;
    if (options.logLevel) this.logLevel = options.logLevel;
    if (options.maxRetries !== undefined) this.maxRetries = options.maxRetries;
    if (options.retryDelay !== undefined) this.retryDelay = options.retryDelay;
    
    if (options.cache) {
      this.cacheOptions = {
        ...this.cacheOptions,
        ...options.cache
      };
    }
    
    this.log('info', '🔄 Configuração do serviço atualizada');
  }
  
  /**
   * Utilitário de log que respeita o nível configurado
   */
  private log(level: 'error' | 'warn' | 'info' | 'debug', message: string, data?: any): void {
    const levelMap = {
      'none': 0,
      'error': 1,
      'warn': 2,
      'info': 3,
      'debug': 4
    };
    
    if (levelMap[level] <= levelMap[this.logLevel]) {
      const prefix = `[${level.toUpperCase()}] ExternalApiService -`;
      
      switch (level) {
        case 'error':
          console.error(prefix, message, data !== undefined ? data : '');
          break;
        case 'warn':
          console.warn(prefix, message, data !== undefined ? data : '');
          break;
        case 'info':
          console.log(prefix, message, data !== undefined ? data : '');
          break;
        case 'debug':
          console.log(`[DEBUG] ${prefix}`, message, data !== undefined ? data : '');
          break;
      }
    }
  }
  
  /**
   * Define a URL base da API
   */
  public setBaseUrl(url: string): void {
    this.log('info', `Definindo URL base: ${url}`);
    this.baseUrl = url;
  }
  
  /**
   * Obtém a URL base atual
   */
  public getBaseUrl(): string | null {
    // Verifica primeiro no config
    const baseUrlFromConfig = config.API_BASE_URL;
    if (baseUrlFromConfig) {
      this.baseUrl = baseUrlFromConfig;
      this.log('debug', `Usando URL base do config: ${baseUrlFromConfig}`);
    }
    
    return this.baseUrl;
  }
  
  /**
   * Define o nível de log
   */
  public setLogLevel(level: 'none' | 'error' | 'warn' | 'info' | 'debug'): void {
    this.logLevel = level;
    this.log('info', `Nível de log definido para: ${level}`);
  }
  
  /**
   * Adiciona um mapeamento personalizado para uma função
   */
  public addEndpointMapping(functionName: string, path: string, method: Method = 'POST'): void {
    this.endpointMappings[functionName] = { path, method };
    this.log('debug', `Mapeamento adicionado: ${functionName} => ${method} ${path}`);
  }
  
  /**
   * Remove todos os mapeamentos personalizados
   */
  public clearEndpointMappings(): void {
    this.endpointMappings = {};
    this.log('debug', 'Todos os mapeamentos foram removidos');
  }
  
  /**
   * Obtém a URL completa para um caminho da API
   */
  public getApiUrl(path: string): string {
    const baseUrl = this.getBaseUrl();
    
    if (!baseUrl) {
      this.log('warn', 'URL base não configurada, usando localhost:3000');
      return `http://localhost:3000/${path.startsWith('/') ? path.substring(1) : path}`;
    }
    
    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }
  
  /**
   * Mapeia um nome de função e argumentos para um endpoint da API
   */
  public mapFunctionToEndpoint(
    functionName: string, 
    args: any = {}
  ): { path: string; method: Method; } {
    this.log('debug', `Mapeando função: "${functionName}"`, args);
    
    // Verifica se temos um mapeamento personalizado para esta função
    if (this.endpointMappings[functionName]) {
      const mapping = this.endpointMappings[functionName];
      this.log('debug', `Usando mapeamento personalizado para ${functionName}: ${mapping.method} ${mapping.path}`);
      return mapping;
    }
    
    // Verifica se path/url/endpoint foi fornecido nos argumentos
    let path = args.path || args.url || args.endpoint || '';
    let method = (args.method || args.http_method || 'POST').toUpperCase() as Method;
    
    // Se nenhum path foi fornecido, converte o nome da função para formato URL
    if (!path) {
      // Converte camelCase ou snake_case para kebab-case
      path = functionName
        .replace(/_/g, '-')
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();
      
      this.log('debug', `Nenhum path explícito, usando nome da função como path: ${path}`);
    } else {
      this.log('debug', `Usando path dos argumentos: ${path}`);
    }
    
    this.log('info', `Mapeado ${functionName} => ${method} ${path}`);
    return { path, method };
  }
  
  /**
   * Valida e transforma dados de requisição
   */
  public validateRequestData(
    functionName: string, 
    method: Method, 
    data?: any
  ): any {
    this.log('debug', `Validando dados para: ${functionName}, método: ${method}`, data);
    
    if (!data) {
      return {};
    }
    
    // Cria uma cópia para não modificar o objeto original
    let validatedData = { ...data };
    
    // Remove parâmetros especiais que não devem ser enviados para a API
    const specialParams = ['path', 'url', 'endpoint', 'method', 'http_method', 'auth'];
    specialParams.forEach(param => {
      if (validatedData[param] !== undefined) {
        delete validatedData[param];
      }
    });
    
    // Aplica transformações personalizadas
    validatedData = this.applyDataTransformations(functionName, validatedData);
    
    this.log('debug', `Dados após validação:`, validatedData);
    return validatedData;
  }
  
  /**
   * Aplica transformações personalizadas aos dados de requisição
   */
  private applyDataTransformations(functionName: string, data: any): any {
    // Cria uma cópia para não modificar o objeto original
    const transformedData = { ...data };
    
    // Transformações genéricas que se aplicam a todas as funções
    
    // Exemplo: Converte strings de data para formato ISO
    for (const [key, value] of Object.entries(transformedData)) {
      if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        // Converte DD/MM/YYYY para YYYY-MM-DD
        const parts = value.split('/');
        if (parts.length === 3) {
          transformedData[key] = `${parts[2]}-${parts[1]}-${parts[0]}`;
          this.log('debug', `Data transformada ${key} de ${value} para ${transformedData[key]}`);
        }
      }
    }
    
    // Correções de nomes de campos comuns (como ada/ado em português)
    const fieldNames = Object.keys(transformedData);
    for (const fieldName of fieldNames) {
      // Transformação específica para português (ada -> ado)
      if (fieldName.endsWith('ada') && !transformedData[fieldName.replace(/ada$/, 'ado')]) {
        this.log('debug', `Transformando campo ${fieldName} para ${fieldName.replace(/ada$/, 'ado')}`);
        transformedData[fieldName.replace(/ada$/, 'ado')] = transformedData[fieldName];
        delete transformedData[fieldName];
      }
    }
    
    return transformedData;
  }
  
  /**
   * Prepara autenticação para uma chamada de API
   */
  private prepareAuthentication(auth?: AuthConfig): Record<string, string> {
    if (!auth || auth.type === 'none') {
      return {};
    }
    
    switch (auth.type) {
      case 'basic':
        if (auth.username && auth.password) {
          const base64Auth = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
          return { 'Authorization': `Basic ${base64Auth}` };
        }
        break;
        
      case 'bearer':
        if (auth.token) {
          return { 'Authorization': `Bearer ${auth.token}` };
        }
        break;
        
      case 'api-key':
        if (auth.apiKey) {
          const headerName = auth.apiKeyHeaderName || 'X-API-Key';
          return { [headerName]: auth.apiKey };
        }
        break;
        
      case 'custom':
        if (auth.customHeaderName && auth.customHeaderValue) {
          return { [auth.customHeaderName]: auth.customHeaderValue };
        }
        break;
    }
    
    this.log('warn', `Configuração de autenticação inválida`, auth);
    return {};
  }
  
  /**
   * Gera uma chave de cache para uma requisição
   */
  private generateCacheKey(method: string, url: string, data?: any): string {
    const dataString = data ? JSON.stringify(data) : '';
    return `${method}:${url}:${dataString}`;
  }
  
  /**
   * Verifica se há uma resposta em cache válida
   */
  private getCachedResponse<T>(cacheKey: string): ApiResponse<T> | null {
    if (!this.cacheOptions.enabled) {
      return null;
    }
    
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return null;
    }
    
    // Verifica se o cache expirou
    const now = Date.now();
    if (now - cached.timestamp > this.cacheOptions.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return {
      ...cached.data,
      cached: true
    };
  }
  
  /**
   * Armazena uma resposta no cache
   */
  private setCacheResponse<T>(cacheKey: string, response: ApiResponse<T>): void {
    if (!this.cacheOptions.enabled) {
      return;
    }
    
    this.cache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });
  }
  
  /**
   * Chama uma API externa com retries e cache
   */
  public async callExternalApi<T = any>(
    path: string, 
    method: Method = 'GET', 
    data?: any, 
    options?: {
      functionName?: string;
      auth?: AuthConfig;
      headers?: Record<string, string>;
      timeout?: number;
      skipCache?: boolean;
    }
  ): Promise<ApiResponse<T>> {
    const baseUrl = this.getBaseUrl();
    
    if (!baseUrl) {
      this.log('error', 'URL base não configurada');
      return {
        success: false,
        status: 0,
        data: null as any,
        error: {
          message: 'URL base da API não configurada',
          code: 'CONFIG_ERROR'
        }
      };
    }
    
    const apiUrl = this.getApiUrl(path);
    const functionName = options?.functionName;
    
    this.log('info', `Chamando API: ${method} ${apiUrl}`, data);
    
    // Aplica validação e transformação se um nome de função for fornecido
    const requestData = functionName 
      ? this.validateRequestData(functionName, method, data)
      : data;
    
    // Verifica o cache primeiro se habilitado e o método for GET
    const cacheKey = this.generateCacheKey(method, apiUrl, requestData);
    if (method === 'GET' && !options?.skipCache) {
      const cachedResponse = this.getCachedResponse<T>(cacheKey);
      if (cachedResponse) {
        this.log('debug', `Usando resposta em cache para ${method} ${apiUrl}`);
        return cachedResponse;
      }
    }
    
    // Prepara configuração da requisição
    const requestConfig: AxiosRequestConfig = {
      method,
      url: apiUrl,
      headers: {
        ...this.defaultHeaders,
        ...this.prepareAuthentication(options?.auth),
        ...(options?.headers || {})
      },
      timeout: options?.timeout || this.timeout
    };
    
    // Adiciona corpo da requisição para métodos que o suportam
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      requestConfig.data = requestData;
    } else if (requestData && Object.keys(requestData).length > 0) {
      // Para outros métodos, adiciona parâmetros de consulta
      requestConfig.params = requestData;
    }
    
    // Implementa lógica de retry
    let retries = 0;
    let lastError: any = null;
    
    while (retries <= this.maxRetries) {
      try {
        if (retries > 0) {
          this.log('info', `Tentativa ${retries}/${this.maxRetries} para ${method} ${apiUrl}`);
          // Backoff exponencial
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, retries - 1)));
        }
        
        const response: AxiosResponse = await axios(requestConfig);
        
        const apiResponse: ApiResponse<T> = {
          success: true,
          status: response.status,
          data: response.data
        };
        
        // Armazena respostas GET bem-sucedidas em cache
        if (method === 'GET') {
          this.setCacheResponse(cacheKey, apiResponse);
        }
        
        this.log('debug', `Resposta da API:`, {
          status: response.status,
          data: response.data
        });
        
        return apiResponse;
      } catch (error: any) {
        lastError = error;
        
        // Registra o erro
        if (error.response) {
          // A requisição foi feita e o servidor respondeu com um código de status fora de 2xx
          this.log('error', `Erro da API ${error.response.status}:`, {
            status: error.response.status,
            data: error.response.data,
            headers: error.response.headers
          });
          
          // Se recebermos um erro 4xx (exceto 429), não repetimos
          if (error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429) {
            break;
          }
        } else if (error.request) {
          // A requisição foi feita mas nenhuma resposta foi recebida
          this.log('error', 'Sem resposta recebida:', error.request);
        } else {
          // Algo aconteceu na configuração da requisição
          this.log('error', 'Erro na configuração da requisição:', error.message);
        }
        
        retries++;
      }
    }
    
    // Se chegamos aqui, todas as tentativas falharam
    const errorResponse: ApiResponse<T> = {
      success: false,
      status: lastError?.response?.status || 0,
      data: null as any,
      error: {
        message: lastError?.response?.data?.message || lastError?.message || 'Erro desconhecido',
        code: lastError?.response?.data?.code || 'REQUEST_FAILED',
        details: lastError?.response?.data
      }
    };
    
    this.log('error', `Requisição falhou após ${retries} tentativas`, errorResponse);
    
    return errorResponse;
  }
  
  /**
   * Método de conveniência para requisições GET
   */
  public async get<T = any>(
    path: string, 
    params?: any, 
    options?: {
      functionName?: string;
      auth?: AuthConfig;
      headers?: Record<string, string>;
      timeout?: number;
      skipCache?: boolean;
    }
  ): Promise<ApiResponse<T>> {
    return this.callExternalApi<T>(path, 'GET', params, options);
  }
  
  /**
   * Método de conveniência para requisições POST
   */
  public async post<T = any>(
    path: string, 
    data?: any, 
    options?: {
      functionName?: string;
      auth?: AuthConfig;
      headers?: Record<string, string>;
      timeout?: number;
      skipCache?: boolean;
    }
  ): Promise<ApiResponse<T>> {
    return this.callExternalApi<T>(path, 'POST', data, options);
  }
  
  /**
   * Método de conveniência para requisições PUT
   */
  public async put<T = any>(
    path: string, 
    data?: any, 
    options?: {
      functionName?: string;
      auth?: AuthConfig;
      headers?: Record<string, string>;
      timeout?: number;
      skipCache?: boolean;
    }
  ): Promise<ApiResponse<T>> {
    return this.callExternalApi<T>(path, 'PUT', data, options);
  }
  
  /**
   * Método de conveniência para requisições DELETE
   */
  public async delete<T = any>(
    path: string, 
    params?: any, 
    options?: {
      functionName?: string;
      auth?: AuthConfig;
      headers?: Record<string, string>;
      timeout?: number;
      skipCache?: boolean;
    }
  ): Promise<ApiResponse<T>> {
    return this.callExternalApi<T>(path, 'DELETE', params, options);
  }
  
  /**
   * Método de conveniência para requisições PATCH
   */
  public async patch<T = any>(
    path: string, 
    data?: any, 
    options?: {
      functionName?: string;
      auth?: AuthConfig;
      headers?: Record<string, string>;
      timeout?: number;
      skipCache?: boolean;
    }
  ): Promise<ApiResponse<T>> {
    return this.callExternalApi<T>(path, 'PATCH', data, options);
  }
  
  /**
   * Limpa o cache
   */
  public clearCache(): void {
    this.cache.clear();
    this.log('info', 'Cache limpo');
  }
  
  /**
   * Executa manualmente uma chamada de função definida pelo Assistente da OpenAI
   */
  public async executeFunctionCall(
    functionCall: {
      name: string;
      arguments: string;
    }
  ): Promise<any> {
    try {
      const functionName = functionCall.name;
      let args: any = {};
      
      try {
        args = JSON.parse(functionCall.arguments || '{}');
      } catch (e) {
        console.error(`Falha ao analisar argumentos da função: ${functionCall.arguments}`, e);
        throw new Error(`Argumentos da função inválidos: ${e.message}`);
      }
      
      console.log(`Executando chamada de função: ${functionName}`, args);
      
      // Obtém a instância singleton
      const instance = ExternalApiService.getInstance();
      
      // Mapeia a função para um endpoint
      const { path, method } = instance.mapFunctionToEndpoint(functionName, args);
      
      // Extrai configuração de autenticação se presente
      const auth: AuthConfig | undefined = args.auth;
      
      // Faz a chamada da API
      const response = await instance.callExternalApi(
        path, 
        method, 
        args, 
        { 
          functionName,
          auth
        }
      );
      
      return response;
    } catch (error: any) {
      console.error(`Erro de execução da função: ${error.message}`, error);
      return {
        success: false,
        error: {
          message: error.message,
          code: 'FUNCTION_EXECUTION_ERROR'
        }
      };
    }
  }
}

// Exporta uma instância singleton para compatibilidade com código existente
export default ExternalApiService.getInstance();