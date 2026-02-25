#!/usr/bin/env node
/**
 * Script de préchargement des modèles d'embeddings
 * Utilisé pendant le build Docker pour télécharger les modèles à l'avance
 *
 * Usage (Docker) : node scripts/preload-model.mjs
 * Usage (local)  : XDG_CACHE_HOME=~/.cache node scripts/preload-model.mjs
 */

import { env, pipeline } from '@huggingface/transformers';

// Configurer le cache (lu depuis env var ou défaut)
const cacheDir = process.env.XDG_CACHE_HOME || '/hf-cache';
env.cacheDir = cacheDir;

console.log(`[preload] Cache dir: ${cacheDir}`);

// Modèle principal (384 dims, multilingue)
const PRIMARY_MODEL = 'Xenova/multilingual-e5-small';
// Fallback (si le principal échoue)
const FALLBACK_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

async function preloadModel(modelName, options = {}) {
  console.log(`[preload] Téléchargement de ${modelName}...`);
  const start = Date.now();

  try {
    await pipeline('feature-extraction', modelName, options);
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[preload] ✅ ${modelName} prêt (${duration}s)`);
    return true;
  } catch (err) {
    console.error(`[preload] ❌ ${modelName} échoué:`, err.message);
    return false;
  }
}

async function main() {
  console.log('[preload] Démarrage du préchargement des modèles...\n');

  // Essayer le modèle principal (non quantifié pour stabilité)
  const primarySuccess = await preloadModel(PRIMARY_MODEL, { quantized: false });

  if (!primarySuccess) {
    console.log('\n[preload] Le modèle principal a échoué, téléchargement du fallback...');
    await preloadModel(FALLBACK_MODEL, { quantized: true });
  }

  console.log(`\n[preload] ✨ Préchargement terminé !`);
  console.log(`[preload] Cache stocké dans: ${cacheDir}`);
}

main().catch((err) => {
  console.error('[preload] Erreur fatale:', err);
  process.exit(1);
});
