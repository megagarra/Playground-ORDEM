import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import config from '../config';
import { Thread } from '../database';
import * as cli from '../cli/ui';
import { Message, MessageMedia } from '@periskope/whatsapp-web.js';
import { moderateIncomingPrompt } from './moderation';
import { ttsRequest } from '../providers/speech';
import { convertOggToWav } from '../utils';
import type { FunctionTool } from 'openai/resources/beta/assistants';

export const openai = new OpenAI({ apiKey: config.openAIAPIKey });

const tools: FunctionTool[] = [
    {
        type: 'function',
        function: {
            name: 'reactToUserMessage',
            description: 'Based on human input react to message with appropriate emoji',
            parameters: {
                type: 'object',
                properties: {
                    emoji: {
                        type: 'string'
                    }
                },
                required: ['emoji']
            }
        }
    }
];

// Função para ler o arquivo shearch
function readShearchFile() {
    const filePath = path.join(__dirname, '../planobrandino.pdf');

    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return data;
    } catch (error) {
        console.error('Error reading shearch file:', error);
        return null;
    }
}

export async function assistantResponse(threadId: string, prompt: string, tools: any[] = [], callback: any = null) {
    const runs = await openai.beta.threads.runs.list(threadId);

    if (runs?.data?.length > 0) {
        const lastRun = runs.data[runs.data.length - 1];
        if (lastRun.status === 'in_progress' || lastRun.status === 'queued') {
            console.log('Waiting for previous run to complete', lastRun.id, lastRun.status, threadId);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            return await assistantResponse(threadId, prompt, tools, callback);
        }
    }

    // Ler o conteúdo do arquivo shearch
    const shearchContent = readShearchFile();
    if (shearchContent) {
        console.log('Conteúdo do arquivo shearch:', shearchContent);
    } else {
        console.log('Não foi possível ler o arquivo shearch.');
    }

    await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: prompt
    });

    const run = await openai.beta.threads.runs.create(threadId, {
        tools,
        tool_choice: 'auto',
        model: config.openAIModel,
        assistant_id: config.openAIAssistantId,
		instructions: 'Meu nome é Alexandre Garra, mais conhecido como Garra, eu sou cabo eleitoral do Brandino candidato a prefeito e da Silmara como vice',
        additional_instructions: 'Verifique em seu arquivo os dados para responder e fazer campanha para os candidatos'
    });

    let actualRun = await openai.beta.threads.runs.retrieve(threadId, run.id);

    while (actualRun.status === 'queued' || actualRun.status === 'in_progress' || actualRun.status === 'requires_action') {
        if (actualRun.status === 'requires_action' && callback) {
            const outputs = await callback?.(actualRun);

            await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
                tool_outputs:
                    outputs?.map((output: any) => ({
                        tool_call_id: output.id,
                        output: JSON.stringify(output.output)
                    })) || []
            });
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
        actualRun = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessageForRun = messages.data.filter((message) => message.run_id === run.id && message.role === 'assistant').pop();
    if (lastMessageForRun) {
        const messageValue = lastMessageForRun.content[0] as {
            text: { value: string }
        };

        return messageValue;
    }
}

export async function findOrCreateThread(id: string, meta: any) {
    const thread = await Thread.findOne({ where: { identifier: id } });

    if (thread) {
        console.log('Thread exists');
        return thread.openai_thread_id;
    } else {
        const openaiThread = await openai.beta.threads.create({ metadata: { identifier: id, medium: 'whatsapp' } });
        const newThread = {
            identifier: id,
            openai_thread_id: openaiThread.id,
            medium: 'whatsapp'
        };

        await Thread.create(newThread);

        console.log('New thread created', newThread);

        return openaiThread.id;
    }
}

export async function transcribeOpenAI(audioBuffer: Buffer): Promise<{ text: string }> {
    const tempdir = os.tmpdir();
    const oggPath = path.join(tempdir, randomUUID() + '.ogg');
    const wavFilename = randomUUID() + '.wav';
    const wavPath = path.join(tempdir, wavFilename);

    try {
        const { blobFromSync, File } = await import('fetch-blob/from.js');
        fs.writeFileSync(oggPath, audioBuffer);
        await convertOggToWav(oggPath, wavPath);

        const response = await openai.audio.transcriptions.create({
            file: new File([blobFromSync(wavPath)], wavFilename, { type: 'audio/wav' }),
            model: 'whisper-1',
            response_format: 'json'
        });

        fs.unlinkSync(oggPath);
        fs.unlinkSync(wavPath);

        return {
            text: response.text
        };
    } catch (error) {
        console.error(error);
        fs.unlinkSync(oggPath);
        fs.unlinkSync(wavPath);

        return {
            text: ''
        };
    }
}


const handleMessageGPT = async (message: Message, prompt: string) => {
    try {
        cli.print(`[GPT] Received prompt from ${message.from}: ${prompt}`);
        const start = Date.now();
        await moderateIncomingPrompt(prompt);

        const response = await handleAssistantResponse(message, prompt);

        const end = Date.now() - start;
        cli.print(`[GPT] Answer to ${message.from}: ${response?.text.value} | OpenAI request took ${end}ms)`);

        if (response?.text?.value) {
            message.reply(response.text.value);
        }
    } catch (error) {
        console.error('An error occured', error);
        message.reply('An error occured, please contact the administrator. (' + error.message + ')');
    }
};

async function handleVoiceMessageReply(message: Message) {
    try {
        const media = await message.downloadMedia();

        if (!media || !media.mimetype.startsWith('audio/')) {
            message.reply('I can only process audio messages.');
            return;
        }

        const start = Date.now();

        const mediaBuffer = Buffer.from(media.data, 'base64');
        const { text: transcribedText } = await transcribeOpenAI(mediaBuffer);

        if (transcribedText == null) {
            message.reply("I couldn't understand what you said.");
            return;
        }

        if (transcribedText.length == 0) {
            message.reply("I couldn't understand what you said.");
            return;
        }

        cli.print(`[Transcription] Transcription response: ${transcribedText}`);

        await moderateIncomingPrompt(transcribedText);

        const response = await handleAssistantResponse(message, transcribedText);

        const end = Date.now() - start;
        cli.print(`[GPT] Answer to ${message.from}: ${response.text.value}  | OpenAI request took ${end}ms)`);

        if (!response?.text?.value) return;

        cli.print(`[TTS] Generating audio from GPT response...`);
        const audioBuffer = await ttsRequest(response.text.value);
        if (audioBuffer == null || audioBuffer.length == 0) {
            message.reply(`[TTS] couldn't generate audio, please contact the administrator.`);
            return;
        }

        cli.print(`[TTS] Audio generated!`);
        const tempFolder = os.tmpdir();
        const tempFilePath = path.join(tempFolder, randomUUID() + '.opus');

        cli.print(`[TTS] Saving audio to temp file... ${tempFilePath}`);
        fs.writeFileSync(tempFilePath, audioBuffer);

        cli.print(`[TTS] Sending audio...`);
        const messageMedia = new MessageMedia('audio/ogg; codecs=opus', audioBuffer.toString('base64'));
        message.reply(messageMedia);
        fs.unlinkSync(tempFilePath);
    } catch (error) {
        console.error('An error occured', error);
        message.reply('An error occured, please contact the administrator. (' + error.message + ')');
    }
}

async function reactToUserMessage(message: Message, emoji: string) {
    console.log(`[GPT] Reacting to user message with emoji: ${emoji}`);
    return message.react(`${emoji}`);
}

async function handleAssistantResponse(message: Message, prompt: string) {
    await message.react(`💬`);
    const chatInfo = await message.getChat();
    const meta: any = {
		// @ts-ignore
		name: message._data.notifyName || message.author,
		groupName: chatInfo.name,
		isGroup: chatInfo.isGroup
	}

    console.log(`[GPT] meta info: ${meta}`);

    const threadId = await findOrCreateThread(message.from, meta);

    let emoji = '';
    const p = `${chatInfo.timestamp} ${chatInfo.isGroup ? `(${chatInfo.name}) ` : ''}${meta.name}: ${prompt}`;

    cli.print(`[GPT] Sending prompt to OpenAI: ${p}`);

    const response = await assistantResponse(threadId, p, tools, async (run) => {
        if (run.required_action?.submit_tool_outputs?.tool_calls[0].function.name === 'reactToUserMessage') {
            emoji = JSON.parse(run.required_action?.submit_tool_outputs?.tool_calls[0].function.arguments || '{}').emoji;

            try {
                await reactToUserMessage(message, emoji);
            } catch (error) {
                console.error('Error reacting to user message', error, emoji);
            }

            return [
                {
                    id: run.required_action?.submit_tool_outputs?.tool_calls[0].id,
                    output: {
                        success: true
                    }
                }
            ];
        }
    });

    if (response?.text.value.trim() === emoji) {
        response.text.value = '';
    }

    return response;
}

export { handleMessageGPT, handleVoiceMessageReply };
