# WhatsApp Service Order Bot

![WhatsApp Service Order Bot](https://img.shields.io/badge/WhatsApp-Bot-green)
![Node.js](https://img.shields.io/badge/Node.js-14.0%2B-blue)
![OpenAI](https://img.shields.io/badge/OpenAI-API-blue)

## Table of Contents

- [Visão Geral](#visão-geral)
- [Recursos](#recursos)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Uso](#uso)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Funções Disponíveis](#funções-disponíveis)
- [Contribuição](#contribuição)
- [Licença](#licença)

## Visão Geral

O **WhatsApp Service Order Bot** é uma aplicação Node.js que integra o WhatsApp Web com a API da OpenAI para gerenciar ordens de serviço de forma automatizada. Utilizando o WhatsApp como interface de comunicação, o bot permite criar, consultar, atualizar e excluir ordens de serviço diretamente através de mensagens de WhatsApp.

## Recursos

- **Integração com WhatsApp Web**: Autenticação via QR Code e interação em tempo real.
- **Chat Inteligente**: Utiliza o modelo GPT-4 da OpenAI para entender e processar mensagens dos usuários.
- **CRUD de Ordens de Serviço**: Criação, leitura, atualização e exclusão de ordens de serviço através de comandos de texto.
- **Armazenamento Local**: Gerenciamento de sessões e histórico de conversas.
- **Geração de QR Code**: Exibição do QR Code no terminal para autenticação rápida.

## Pré-requisitos

Antes de começar, você precisará ter instalado em sua máquina:

- [Node.js](https://nodejs.org/) (versão 14 ou superior)
- [npm](https://www.npmjs.com/) (gerenciador de pacotes do Node.js)
- Conta na [OpenAI](https://openai.com/) com acesso à API
- Servidor backend para gerenciar as ordens de serviço (API RESTful)

## Instalação

1. **Clone o Repositório**

   ```bash
   git clone https://github.com/seu-usuario/whatsapp-service-order-bot.git
   cd whatsapp-service-order-bot
