/**
 * llmClient.ts
 * Client LLM pour la génération de réponses (pattern RAG).
 *
 * Modes disponibles (sélection automatique) :
 *   1. Mistral — si MISTRAL_API_KEY est défini (mistral-small-latest par défaut)
 *   2. OpenAI  — si OPENAI_API_KEY est défini (gpt-4o-mini)
 *   3. Ollama  — si OLLAMA_MODEL est défini ou si localhost:11434 répond
 *   4. Fallback — affiche les sections pertinentes sans génération
 *
 * Aucune dépendance obligatoire : openai est chargé dynamiquement.
 * Mistral et Ollama utilisent fetch natif.
 */

import type { LLMResponse } from '../types';

// ── Prompt système ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un assistant expert en jeux de société.
Tu réponds aux questions des joueurs en te basant UNIQUEMENT sur les règles fournies dans le contexte.
Si la réponse ne se trouve pas dans le contexte, dis-le clairement.
Réponds en français, de façon concise et précise.
Ne répète pas les extraits de règles mot pour mot : synthétise et explique.`;

// ── Mode Mistral ──────────────────────────────────────────────────────────────

async function queryMistral(question: string, context: string): Promise<LLMResponse> {
  const apiKey = process.env['MISTRAL_API_KEY'] ?? '';
  const model  = process.env['MISTRAL_MODEL'] ?? 'mistral-small-latest';

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `CONTEXTE :\n${context}\n\nQUESTION : ${question}` },
      ],
      temperature: 0.2,
      max_tokens: 700,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Mistral HTTP ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
  };

  return {
    answer: data.choices[0].message.content.trim(),
    model: data.model ?? model,
    used_llm: true,
  };
}

// ── Mode OpenAI ───────────────────────────────────────────────────────────────

/** Interface minimale pour OpenAI Chat (évite de dépendre du package au compile). */
interface OpenAIChatClient {
  chat: {
    completions: {
      create(params: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        temperature: number;
        max_tokens: number;
      }): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
}

async function queryOpenAI(question: string, context: string): Promise<LLMResponse> {
  let OpenAI: new (opts: { apiKey: string }) => OpenAIChatClient;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    OpenAI = (require('openai') as { default: typeof OpenAI }).default;
  } catch {
    throw new Error('La bibliothèque "openai" n\'est pas installée.\nExécutez : pnpm add openai');
  }

  const client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] ?? '' });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `CONTEXTE :\n${context}\n\nQUESTION : ${question}` },
    ],
    temperature: 0.2,
    max_tokens: 700,
  });

  return {
    answer: response.choices[0].message.content ?? '(réponse vide)',
    model: 'gpt-4o-mini',
    used_llm: true,
  };
}

// ── Mode Ollama ───────────────────────────────────────────────────────────────

async function queryOllama(question: string, context: string): Promise<LLMResponse> {
  const host = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
  const model = process.env['OLLAMA_MODEL'] ?? 'llama3';

  const body = JSON.stringify({
    model,
    prompt: `${SYSTEM_PROMPT}\n\nCONTEXTE :\n${context}\n\nQUESTION : ${question}\n\nRÉPONSE :`,
    stream: false,
  });

  const response = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = await response.json() as { response: string };

  return {
    answer: data.response.trim(),
    model: `ollama/${model}`,
    used_llm: true,
  };
}

/** Vérifie si Ollama est accessible. */
async function isOllamaAvailable(): Promise<boolean> {
  const host = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Mode Fallback (aucun LLM) ─────────────────────────────────────────────────

function fallbackResponse(context: string): LLMResponse {
  return {
    answer: context,
    model: 'aucun (mode sans LLM)',
    used_llm: false,
  };
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

/**
 * Envoie une question + contexte au LLM disponible.
 * Sélection automatique : OpenAI > Ollama > Fallback.
 *
 * @param question - Question de l'utilisateur
 * @param context  - Contexte extrait de la KB (sections pertinentes formatées)
 */
export async function queryLLM(question: string, context: string): Promise<LLMResponse> {
  // 1. Mistral
  if (process.env['MISTRAL_API_KEY']) {
    return queryMistral(question, context);
  }

  // 2. OpenAI
  if (process.env['OPENAI_API_KEY']) {
    return queryOpenAI(question, context);
  }

  // 3. Ollama (local)
  if (process.env['OLLAMA_MODEL'] || await isOllamaAvailable()) {
    try {
      return await queryOllama(question, context);
    } catch {
      // Ollama déclaré mais inaccessible → fallback
    }
  }

  // 4. Fallback
  return fallbackResponse(context);
}
