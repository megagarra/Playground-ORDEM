
# 📙 **README - Sistema de Bot de WhatsApp Integrado com OpenAI e API Externa**

## 🖋️ **Índice**
1. [🖐 Visão Geral](#-visao-geral)
2. [🔧️ Tecnologias Utilizadas](#️-tecnologias-utilizadas)
3. [⚙️ Configuração do Ambiente](#️-configuracao-do-ambiente)
4. [🚀 Como Executar o Sistema](#-como-executar-o-sistema)
5. [📡 Estrutura do Sistema](#-estrutura-do-sistema)
6. [🔍 Explicação dos Principais Arquivos](#-explicacao-dos-principais-arquivos)
7. [🚀 Principais Funcionalidades](#-principais-funcionalidades)
8. [📢 Eventos do WhatsApp](#-eventos-do-whatsapp)
9. [💬 Como Usar o Bot](#-como-usar-o-bot)
10. [🔧️ Possíveis Erros e Soluções](#️-possiveis-erros-e-solucoes)
11. [🎮 Como Usar o Playground do OpenAI](#-como-usar-o-playground-do-openai)
12. [🛠️ Contribuição](#-contribuicao)
13. [📜 Licença](#-licenca)

---

## 🖐 **Visão Geral**
Este projeto é um sistema de automação de mensagens no **WhatsApp** utilizando a biblioteca **@periskope/whatsapp-web.js**. Ele se integra com a API da **OpenAI** para processar mensagens e realizar ações dinâmicas através do **Assistant Playground**. Também possui suporte para chamadas de API externas personalizadas.

O sistema realiza as seguintes funções principais:
- Recebe e processa mensagens de usuários do WhatsApp.
- Integra com o **OpenAI Assistant Playground** para gerar respostas inteligentes.
- Suporte a **chamadas de API externas dinâmicas**.
- Exibe o QR Code no terminal para autenticar o bot.

---

## 🔧️ **Tecnologias Utilizadas**
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

## 🎮 **Como Usar o Playground do OpenAI**
O OpenAI Playground permite criar **System Instructions** e **Functions** personalizadas para otimizar o comportamento da IA e definir fluxos de trabalho dinâmicos.

### 🔧 **Passo a Passo**

#### 1. **Acessar o Playground**
- Acesse o site do OpenAI e navegue até a opção **Playground**.
- Garanta que você esteja logado com uma conta com permissões de uso de IA da OpenAI.

#### 2. **Configurar a System Instruction**
- A **System Instruction** define o contexto e as regras que o assistente seguirá ao responder.
- Exemplo de System Instruction:
  ```text
  Você é um assistente de IA especializado em responder perguntas de forma clara e objetiva. Responda com empatia e mantenha a simplicidade nas suas respostas.
  ```

#### 3. **Criar as Functions**
- As **Functions** permitem que a IA chame funções específicas dentro do sistema, como consultas de API, chamadas de ferramentas externas, entre outros.
- No OpenAI Playground, é possível criar uma **Function** clicando na opção "Add Function".
- Exemplo de Function JSON:
  ```json
  {
    "name": "get_weather",
    "description": "Obtém a previsão do tempo para uma cidade especificada.",
    "parameters": {
      "type": "object",
      "properties": {
        "city": {
          "type": "string",
          "description": "O nome da cidade para a qual deseja a previsão do tempo."
        }
      },
      "required": ["city"]
    }
  }
  ```

---

## 🛠️ **Contribuição**
1. Faça um fork do repositório.
2. Crie uma branch de recurso (`git checkout -b feature/nova-funcionalidade`).
3. Envie suas alterações (`git commit -m 'Adiciona nova funcionalidade'`).
4. Envie para a branch principal (`git push origin feature/nova-funcionalidade`).
5. Abra um Pull Request.

---

## 📜 **Licença**
Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes.
