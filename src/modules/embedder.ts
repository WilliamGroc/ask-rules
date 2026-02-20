/**
 * embedder.ts  (module optionnel)
 * Génère des embeddings vectoriels pour chaque section du manuel.
 *
 * ── Deux modes ────────────────────────────────────────────────────────────────
 *
 *  Mode 1 — OpenAI  (OPENAI_API_KEY requis)
 *    Modèle : text-embedding-3-small  (1536 dimensions, vecteur dense)
 *    Install : pnpm add openai
 *
 *  Mode 2 — TF-IDF local  (aucune dépendance externe)
 *    Vecteur creux basé sur la fréquence des termes.
 *    Utile pour tester sans clé API.
 */

import type { EmbeddingVector } from '../types';

// ── Mode 1 : OpenAI ───────────────────────────────────────────────────────────

/** Minimal interface pour l'API OpenAI Embeddings (évite de dépendre du package). */
interface OpenAIClient {
  embeddings: {
    create(params: { model: string; input: string }): Promise<{
      data: Array<{ embedding: number[] }>;
    }>;
  };
}

async function embedWithOpenAI(text: string): Promise<number[]> {
  let OpenAI: new (opts: { apiKey: string }) => OpenAIClient;

  try {
    // require() dynamique : ne plante pas à la compilation si openai n'est pas installé.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    OpenAI = (require('openai') as { default: typeof OpenAI }).default;
  } catch {
    throw new Error(
      'La bibliothèque "openai" n\'est pas installée.\n' +
      'Exécutez : pnpm add openai',
    );
  }

  const client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] ?? '' });
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}

// ── Mode 2 : TF-IDF local (fallback) ─────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall',
  'this', 'that', 'these', 'those', 'it', 'its', 'i', 'you', 'he', 'she', 'we',
  'they', 'their', 'our', 'your', 'my', 'his', 'her',
]);

/** Tokenise un texte en mots significatifs (stopwords supprimés). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Construit un vecteur TF-IDF normalisé (vecteur creux, 50 dims max).
 * Retourne un objet { terme: fréquence_normalisée }.
 */
function embedWithTFIDF(text: string): Record<string, number> {
  const tokens = tokenize(text);
  const freq: Record<string, number> = {};

  tokens.forEach(t => { freq[t] = (freq[t] ?? 0) + 1; });

  // Normalisation L2
  const norm = Math.sqrt(Object.values(freq).reduce((s, v) => s + v * v, 0));
  const vector: Record<string, number> = {};
  Object.entries(freq).forEach(([term, count]) => {
    vector[term] = norm > 0 ? count / norm : 0;
  });

  // Retourne les 50 termes les plus fréquents
  return Object.fromEntries(
    Object.entries(vector)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50),
  );
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

/**
 * Génère un embedding pour un texte donné.
 * Sélectionne automatiquement OpenAI ou TF-IDF selon l'environnement.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingVector> {
  if (process.env['OPENAI_API_KEY']) {
    return embedWithOpenAI(text);
  }
  return embedWithTFIDF(text);
}
