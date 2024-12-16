# 📚 **README - Sistema de Bot de WhatsApp Integrado com OpenAI e API Externa**

## 📝 **Índice**
1. [📖 Visão Geral](#-visao-geral)
2. [🛠️ Tecnologias Utilizadas](#️-tecnologias-utilizadas)
3. [⚙️ Configuração do Ambiente](#-configuracao-do-ambiente)
4. [🚀 Como Executar o Sistema](#-como-executar-o-sistema)
5. [📡 Estrutura do Sistema](#-estrutura-do-sistema)
6. [🔍 Explicação dos Principais Arquivos](#-explicacao-dos-principais-arquivos)
7. [🚀 Principais Funcionalidades](#-principais-funcionalidades)
8. [📢 Eventos do WhatsApp](#-eventos-do-whatsapp)
9. [💬 Como Usar o Bot](#-como-usar-o-bot)
10. [🛠️ Possíveis Erros e Soluções](#️-possiveis-erros-e-solucoes)

---

## 📖 **Visão Geral**
Este projeto é um sistema de automação de mensagens no **WhatsApp** utilizando a biblioteca **@periskope/whatsapp-web.js**. Ele se integra com a API da **OpenAI** para processar mensagens e realizar ações dinâmicas através do **Assistant Playground**. Também possui suporte para chamadas de API externas personalizadas.

O sistema realiza as seguintes funções principais:
- Recebe e processa mensagens de usuários do WhatsApp.
- Integra com o **OpenAI Assistant Playground** para gerar respostas inteligentes.
- Suporte a **chamadas de API externas dinâmicas**.
- Exibe o QR Code no terminal para autenticar o bot.

---

## 🛠️ **Tecnologias Utilizadas**
- **Node.js**: Ambiente de execução para JavaScript no servidor.
- **TypeScript**: Linguagem com tipagem estática.
- **@periskope/whatsapp-web.js**: Integração com o WhatsApp Web.
- **OpenAI**: Utilizado para gerar respostas e realizar ações baseadas em IA.
- **Axios**: Para realizar requisições HTTP para APIs externas.
- **dotenv**: Carregamento de variáveis de ambiente a partir do arquivo `.env`.
- **EventEmitter**: Utilizado para gerenciar eventos de QR Code.
- **QR Code**: Para exibição do QR Code no terminal.

---

## ⚙️ **Configuração do Ambiente**
1. **Pré-requisitos**
   - Node.js (versão LTS recomendada)
   - npm ou yarn
   - Conta na OpenAI para obter a API Key
   
2. **Instalar dependências**
   ```bash
   npm install
   ```

3. **Configurar variáveis de ambiente**
   Crie o arquivo `.env` na raiz do projeto com as seguintes variáveis:
   ```env
   API_BASE_URL=https://sua-api.com/api/
   OPENAI_API_KEY=sua_chave_openai
   ASSISTANT_ID=seu_assistant_id
   ```

---

## 🚀 **Como Executar o Sistema**
1. **Instale as dependências**:
   ```bash
   npm install
   ```

2. **Inicie o sistema**:
   ```bash
   npm start
   ```
   
3. **Autenticação do WhatsApp**:
   - No terminal, um QR Code será exibido.
   - Escaneie o QR Code com o aplicativo do WhatsApp.
   - Após isso, o bot estará pronto para receber e responder mensagens.

---

## 📡 **Estrutura do Sistema**
```
📦 projeto-bot
 ┣ 📂 cli
 ┣ 📂 config
 ┣ 📂 constants
 ┣ 📂 node_modules
 ┣ 📜 .env
 ┣ 📜 package.json
 ┣ 📜 README.md
 ┣ 📜 tsconfig.json
 ┣ 📜 index.ts
```
**Principais Arquivos:**
- **index.ts**: Arquivo principal que inicializa o bot e o WhatsApp.
- **config/**: Configurações gerais do sistema.
- **cli/**: Interface de linha de comando (exibição de QR Code, mensagens, etc).
- **constants/**: Arquivos de constantes globais (como paths e URLs).

---

## 🔍 **Explicação dos Principais Arquivos**
### **index.ts**
- Inicializa o cliente do WhatsApp.
- Gerencia eventos do WhatsApp (mensagens, QR Code, autenticação).
- Processa as mensagens utilizando a API do OpenAI.
- Faz chamadas a APIs externas e trata o resultado.

### **cli/ui.ts**
- Exibe o QR Code no terminal.
- Gera mensagens de status amigáveis para o usuário.

### **config/index.ts**
- Carrega e gerencia as variáveis de ambiente de forma centralizada.

### **constants/sessionPath.ts**
- Define o caminho de armazenamento da sessão do WhatsApp.

---

## 🚀 **Principais Funcionalidades**
- **Recepção de mensagens do WhatsApp**: O bot responde automaticamente às mensagens recebidas.
- **Conexão com OpenAI Assistant Playground**: As mensagens dos usuários são processadas usando IA.
- **Execução de Tool Calls**: Permite chamadas de API personalizadas com métodos GET, POST, PUT e DELETE.
- **Autenticação automática**: O QR Code é exibido para autenticação inicial.

---

## 📢 **Eventos do WhatsApp**
| Evento         | Descrição                            |
|----------------|-------------------------------------|
| `qr`           | Exibe o QR Code para escanear no app WhatsApp. |
| `authenticated`| O cliente foi autenticado com sucesso. |
| `auth_failure` | Falha ao tentar autenticar o cliente. |
| `ready`        | O cliente está pronto para operar. |
| `message`      | Recebe uma nova mensagem no WhatsApp. |

---

## 💬 **Como Usar o Bot**
1. Envie uma mensagem para o bot via WhatsApp.
2. O bot responde automaticamente utilizando o OpenAI Assistant.
3. O bot pode fazer chamadas de API personalizadas e retornar o resultado ao usuário.

Exemplo de interação:
- **Você**: "Olá bot!"
- **Bot**: "Olá! Como posso te ajudar hoje?"

---

## 🛠️ **Possíveis Erros e Soluções**
| **Erro**                          | **Causa**                                    | **Solução**                                |
|-----------------------------------|--------------------------------------------|-------------------------------------------|
| `API_BASE_URL não definida`       | Variável de ambiente API_BASE_URL faltando | Verifique o arquivo .env                   |
| `Falha na autenticação do WhatsApp`| QR Code expirou ou sessão foi perdida      | Reinicie o bot e reescaneie o QR Code      |
| `Erro ao processar a mensagem`     | Problema ao processar a resposta da IA    | Verifique se a API OpenAI está ativa      |

---

## 🤝 **Contribuição**
1. Faça um fork do repositório.
2. Crie uma branch de recurso (`git checkout -b feature/nova-funcionalidade`).
3. Envie suas alterações (`git commit -m 'Adiciona nova funcionalidade'`).
4. Envie para a branch principal (`git push origin feature/nova-funcionalidade`).
5. Abra um Pull Request.

---

## 📜 **Licença**
Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes.
