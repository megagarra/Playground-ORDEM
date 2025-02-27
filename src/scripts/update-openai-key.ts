// src/scripts/update-openai-key.ts
import { Config, db } from '../database';
import { config as appConfig, refreshConfig } from '../config';
import readline from 'readline';
import OpenAI from 'openai';

// Cria interface para leitura de input do usuário
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Função para fazer uma pergunta ao usuário e obter resposta
function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Função para verificar se uma chave da OpenAI é válida
async function validateOpenAIKey(apiKey: string): Promise<boolean> {
  try {
    const openai = new OpenAI({ apiKey });
    
    // Tenta fazer uma chamada simples para testar a chave
    const models = await openai.models.list();
    
    console.log('✅ Chave validada com sucesso! Modelos disponíveis:');
    models.data.slice(0, 5).forEach(model => {
      console.log(`- ${model.id}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao validar chave da OpenAI:', error.message);
    return false;
  }
}

// Função principal
async function main() {
  try {
    // Carrega configurações atuais
    await refreshConfig();
    
    console.log('\n==== VERIFICADOR DE CHAVE DA OPENAI ====\n');
    console.log(`Chave atual: ${appConfig.openAIAPIKey.substring(0, 5)}...${appConfig.openAIAPIKey.substring(appConfig.openAIAPIKey.length - 4)}`);
    
    // Testa a chave atual
    console.log('\nTestando chave atual...');
    const isCurrentKeyValid = await validateOpenAIKey(appConfig.openAIAPIKey);
    
    if (isCurrentKeyValid) {
      console.log('\n✅ A chave atual é válida e está funcionando corretamente.');
      
      const shouldUpdate = await question('\nDeseja atualizar a chave mesmo assim? (s/N): ');
      if (shouldUpdate.toLowerCase() !== 's') {
        console.log('Operação cancelada. A chave atual será mantida.');
        rl.close();
        await db.close();
        return;
      }
    } else {
      console.log('\n❌ A chave atual é inválida ou houve um erro na validação.');
    }
    
    // Pede a nova chave
    const newKey = await question('\nDigite a nova chave da API da OpenAI: ');
    
    if (!newKey) {
      console.log('Nenhuma chave fornecida. Operação cancelada.');
      rl.close();
      await db.close();
      return;
    }
    
    // Valida a nova chave
    console.log('\nValidando a nova chave...');
    const isNewKeyValid = await validateOpenAIKey(newKey);
    
    if (!isNewKeyValid) {
      const forceSave = await question('\n⚠️ A nova chave parece inválida. Deseja salvá-la mesmo assim? (s/N): ');
      if (forceSave.toLowerCase() !== 's') {
        console.log('Operação cancelada. A chave não foi atualizada.');
        rl.close();
        await db.close();
        return;
      }
    }
    
    // Atualiza a chave no banco de dados
    console.log('\nAtualizando chave no banco de dados...');
    const configRecord = await Config.findOne({ where: { key: 'OPENAI_API_KEY' } });
    
    if (configRecord) {
      configRecord.value = newKey;
      await configRecord.save();
      console.log('✅ Chave atualizada com sucesso no banco de dados.');
    } else {
      await Config.create({
        key: 'OPENAI_API_KEY',
        value: newKey,
        description: 'Chave de API da OpenAI'
      });
      console.log('✅ Nova configuração criada no banco de dados.');
    }
    
    console.log('\n✅ OPERAÇÃO CONCLUÍDA');
    console.log('Reinicie o servidor para que as mudanças tenham efeito.');
    
  } catch (error) {
    console.error('\n❌ ERRO:', error);
  } finally {
    rl.close();
    await db.close();
  }
}

// Executa o script
main();