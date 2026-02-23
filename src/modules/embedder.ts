/**
 * embedder.ts
 * Génère des embeddings denses (384 dims) pour la recherche pgvector.
 *
 * Modèle : Xenova/paraphrase-multilingual-MiniLM-L12-v2
 *   - 384 dimensions, multilingue (français inclus)
 *   - Exécution 100% locale, pas d'API
 *   - 1er lancement : télécharge le modèle (~50MB) puis utilise le cache
 *
 * La dimension 384 doit correspondre à la colonne `vector(384)` en base.
 */

/** Dimension des embeddings générés. Doit correspondre au schéma PostgreSQL. */
export const EMBEDDING_DIM = 384;

/**
 * Génère un embedding dense de 384 dimensions via Transformers.js.
 * Retourne un tableau de nombres normalisé (L2).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  let pipeline: any;

  try {
    // import() dynamique : compatible ESM (Vite SSR) et CLI tsx.
    // @xenova/transformers expose pipeline comme export nommé (ESM)
    // ou sous .default (interop CJS) selon l'environnement.
    const mod = await import('@xenova/transformers');
    pipeline = (mod as any).pipeline ?? (mod as any).default?.pipeline;
  } catch {
    throw new Error(
      'La bibliothèque "@xenova/transformers" n\'est pas installée.\n' +
      'Exécutez : pnpm add @xenova/transformers',
    );
  }

  // @xenova/transformers v2 n'utilise pas XDG_CACHE_HOME nativement.
  // On lit la variable manuellement pour pointer vers le cache Docker (/hf-cache).
  const cacheDir = process.env.XDG_CACHE_HOME;
  if (cacheDir) {
    (mod as any).env.cacheDir = cacheDir;
  }

  const extractor = await pipeline(
    'feature-extraction',
    'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  );

  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data) as number[];
}
