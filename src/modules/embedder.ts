/**
 * embedder.ts
 * Génère des embeddings denses (384 dims) pour la recherche pgvector.
 *
 * Modèle : Xenova/multilingual-e5-small
 *   - 384 dimensions, multilingue (français inclus)
 *   - Exécution 100% locale, pas d'API
 *   - 1er lancement : télécharge le modèle (~50MB) puis utilise le cache
 *
 * La dimension 384 doit correspondre à la colonne `vector(384)` en base.
 */

/** Dimension des embeddings générés. Doit correspondre au schéma PostgreSQL. */
export const EMBEDDING_DIM = 384;

/**
 * Singleton de l'extracteur — initialisé une seule fois, réutilisé pour toutes
 * les sections. Évite de recharger le modèle ONNX (~120 Mo en q8) à chaque appel.
 */
let extractorInstance: any = null;
let extractorInitPromise: Promise<any> | null = null;

async function getExtractor(): Promise<any> {
  if (extractorInstance) return extractorInstance;

  // Empêche plusieurs initialisations simultanées (ex. Promise.all)
  if (!extractorInitPromise) {
    extractorInitPromise = (async () => {
      let pipeline: any;
      let mod: any;
      try {
        mod = await import('@huggingface/transformers');
        pipeline = (mod as any).pipeline ?? (mod as any).default?.pipeline;
      } catch {
        throw new Error(
          'La bibliothèque "@huggingface/transformers" n\'est pas installée.\n' +
            'Exécutez : pnpm add @huggingface/transformers'
        );
      }

      // @huggingface/transformers v3 n'utilise pas XDG_CACHE_HOME nativement.
      const cacheDir = process.env['XDG_CACHE_HOME'];
      if (cacheDir) {
        (mod as any).env.cacheDir = cacheDir;
      }

      // Essai avec multilingual-e5-small (meilleur que paraphrase-MiniLM)
      // Note : certains modèles n'ont pas de version q8, on essaie d'abord
      try {
        extractorInstance = await pipeline(
          'feature-extraction',
          'Xenova/multilingual-e5-small',
          { quantized: false } // fp32 par défaut, plus stable
        );
        return extractorInstance;
      } catch (err) {
        console.warn('⚠️  multilingual-e5-small échoué, fallback vers paraphrase-MiniLM:', err);
      }

      // Fallback vers le modèle original qui fonctionne toujours
      try {
        extractorInstance = await pipeline(
          'feature-extraction',
          'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
          { quantized: true }
        );
        return extractorInstance;
      } catch (err) {
        console.error("Erreur lors de l'initialisation de l'extracteur :", err);
        throw new Error(
          "Échec de l'initialisation de l'extracteur. Voir les logs pour plus de détails."
        );
      }
    })();
  }

  return extractorInitPromise;
}

/**
 * Génère un embedding dense de 384 dimensions via Transformers.js.
 * Retourne un tableau de nombres normalisé (L2).
 *
 * Le tenseur ONNX intermédiaire est explicitement libéré après extraction
 * pour éviter une accumulation sur le heap WASM section après section.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const data = Array.from(output.data) as number[];
    // Libère le tenseur ONNX du heap WASM — sans cela, chaque appel fuit ~200 Ko.
    output.dispose?.();
    return data;
  } catch (err) {
    console.error("Erreur lors de la génération de l'embedding :", err);
    throw new Error("Échec de la génération de l'embedding. Voir les logs pour plus de détails.");
  }
}

/**
 * Génère un embedding pour une section, en enrichissant le contenu avec
 * la hiérarchie si les métadonnées de chunking sont présentes.
 *
 * Utilisé pour l'insertion en flux dans les routes d'import.
 *
 * @param section - Section avec métadonnées optionnelles de chunking
 * @returns Embedding 384 dimensions
 */
export async function generateEmbeddingForSection(section: {
  contenu: string;
  hierarchy_path?: string;
  chunk_index?: number;
  total_chunks?: number;
}): Promise<number[]> {
  // Si métadonnées de chunking présentes, enrichit le contenu
  const hasChunkMetadata = section.hierarchy_path !== undefined;

  if (hasChunkMetadata) {
    const parts: string[] = [];

    if (section.hierarchy_path) {
      parts.push(`[${section.hierarchy_path}]`);
    }

    if (section.total_chunks && section.total_chunks > 1) {
      parts.push(`(Partie ${(section.chunk_index ?? 0) + 1}/${section.total_chunks})`);
    }

    parts.push('');
    parts.push(section.contenu);

    return generateEmbedding(parts.join('\n'));
  }

  return generateEmbedding(section.contenu);
}
