import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5';

// O rascunho é curto e o usuário está esperando na tela: efeito "low" mantém
// a latência baixa sem perder o tom.
const EFFORT = 'low';

const SYSTEM = [
  'Você escreve respostas de e-mail em nome do João, engenheiro de software brasileiro.',
  'Tom executivo: direto, objetivo, sem clichê corporativo. A informação principal vem na primeira frase.',
  'Responda no mesmo idioma do e-mail original.',
  'Não invente fatos, prazos ou compromissos que não estejam no e-mail ou na instrução.',
  'Devolva apenas o corpo da resposta, em texto puro — sem assunto, sem cabeçalhos, sem o texto citado.',
].join(' ');

export class MissingApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY não configurada');
    this.name = 'MissingApiKeyError';
  }
}

export interface DraftInput {
  from: string;
  subject: string;
  body: string;
  instruction?: string;
}

export async function draftReply({ from, subject, body, instruction }: DraftInput): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingApiKeyError();

  const prompt = [
    `De: ${from}`,
    `Assunto: ${subject}`,
    '',
    body,
    '',
    '---',
    instruction?.trim()
      ? `Escreva a resposta seguindo esta instrução: ${instruction.trim()}`
      : 'Escreva a resposta.',
  ].join('\n');

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: EFFORT },
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}
