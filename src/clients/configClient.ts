// src/clients/configClient.ts
// Cliente da API de configuração para uso em front-end

/**
 * Cliente para interagir com a API de configurações do sistema
 */
export class ConfigClient {
    private baseUrl: string;
  
    /**
     * Cria uma nova instância do cliente de configuração
     * @param baseUrl URL base da API (ex: http://localhost:8080)
     */
    constructor(baseUrl: string) {
      this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }
  
    /**
     * Busca todas as configurações disponíveis
     * @returns Objeto com as configurações
     */
    async getAllConfigs() {
      try {
        const response = await fetch(`${this.baseUrl}/api/config`);
        
        if (!response.ok) {
          throw new Error(`Erro ao buscar configurações: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.data;
      } catch (error) {
        console.error('Erro ao buscar configurações:', error);
        throw error;
      }
    }
  
    /**
     * Busca uma configuração específica
     * @param key Chave da configuração
     * @returns Valor da configuração
     */
    async getConfig(key: string) {
      try {
        const response = await fetch(`${this.baseUrl}/api/config/${key}`);
        
        if (response.status === 404) {
          return null;
        }
        
        if (!response.ok) {
          throw new Error(`Erro ao buscar configuração: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.data.value;
      } catch (error) {
        console.error(`Erro ao buscar configuração '${key}':`, error);
        throw error;
      }
    }
  
    /**
     * Atualiza ou cria uma configuração
     * @param key Chave da configuração
     * @param value Valor da configuração
     * @param description Descrição opcional
     */
    async setConfig(key: string, value: string, description?: string) {
      try {
        const response = await fetch(`${this.baseUrl}/api/config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ key, value, description })
        });
        
        if (!response.ok) {
          throw new Error(`Erro ao atualizar configuração: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error(`Erro ao atualizar configuração '${key}':`, error);
        throw error;
      }
    }
  
    /**
     * Atualiza uma configuração existente
     * @param key Chave da configuração
     * @param value Novo valor
     * @param description Nova descrição (opcional)
     */
    async updateConfig(key: string, value: string, description?: string) {
      try {
        const response = await fetch(`${this.baseUrl}/api/config/${key}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ value, description })
        });
        
        if (response.status === 404) {
          throw new Error(`Configuração '${key}' não encontrada.`);
        }
        
        if (!response.ok) {
          throw new Error(`Erro ao atualizar configuração: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error(`Erro ao atualizar configuração '${key}':`, error);
        throw error;
      }
    }
  }
  
  // Exemplo de uso:
  /*
  const configClient = new ConfigClient('http://localhost:8080');
  
  // Buscar todas as configurações
  configClient.getAllConfigs()
    .then(configs => console.log('Configurações:', configs))
    .catch(error => console.error('Erro:', error));
  
  // Buscar uma configuração específica
  configClient.getConfig('BOT_NAME')
    .then(value => console.log('Nome do bot:', value))
    .catch(error => console.error('Erro:', error));
  
  // Atualizar uma configuração
  configClient.setConfig('BOT_NAME', 'Novo Nome do Bot', 'Nome personalizado do bot')
    .then(response => console.log('Configuração atualizada:', response))
    .catch(error => console.error('Erro:', error));
  */
  
  export default ConfigClient;