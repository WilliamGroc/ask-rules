/**
 * pipeline.ts — Logique d'analyse partagée entre les commandes
 *
 * Utilisé par :
 *   - analyser.ts  (sortie standalone vers resultat.json)
 *   - commands/add.ts  (indexation dans la knowledge base)
 */

import { extractText } from './modules/textExtractor';
import type { PageTextResult } from 'pdf-parse';
import { parseSections, classifySection } from './modules/sectionParser';
import { analyzeText, detectMechanics } from './modules/nlpProcessor';
import { extractGameMetadata, extractGameName } from './modules/gameExtractor';
import { generateEmbedding } from './modules/embedder';
import { chunkSections, enrichChunkContent, getChunkingStats } from './modules/chunker';
import type { GameAnalysisResult, GameSection, GameMechanic, StoredSection } from './types';

export interface PipelineOptions {
  /** Active la génération d'embeddings OpenAI ou TF-IDF dense */
  withEmbed?: boolean;
  /** Active le chunking intelligent avec overlap et hiérarchie */
  withChunking?: boolean;
  /** Callback appelé à chaque section pour afficher la progression */
  onSection?: (index: number, total: number, titre: string) => void;
}

export async function analyseFile(
  filePath: string,
  options: PipelineOptions = {},
): Promise<GameAnalysisResult> {
  const { withEmbed = false, withChunking = false, onSection } = options;

  // 1. Extraction du texte
  const pages: PageTextResult[] = await extractText(filePath);
  // Reconstruction du texte complet avec marqueurs de page pour les modules aval
  const rawText = pages.map(p => `%%PAGE:${p.num}%%\n${p.text}`).join('\n');
  const gameName = extractGameName(rawText);
  const metadata = extractGameMetadata(rawText);

  // 2. Découpage en sections
  const rawSections = parseSections(rawText, gameName);

  // 2.5. Chunking intelligent (optionnel)
  const chunks = withChunking ? chunkSections(rawSections) : null;
  const processingItems = chunks ?? rawSections.map(s => ({
    content: s.contenu,
    originalSection: s,
    metadata: { chunkIndex: 0, totalChunks: 1, hierarchyPath: s.titre },
  }));

  // Affiche les statistiques de chunking si activé
  if (withChunking && chunks) {
    const stats = getChunkingStats(chunks);
    console.log(`\n📊 Chunking: ${stats.totalChunks} chunks générés`);
    console.log(`   Mots par chunk: ${stats.minWords}-${stats.maxWords} (moy: ${stats.avgWordsPerChunk})`);
    console.log(`   Chunks avec overlap: ${stats.chunksWithOverlap}\n`);
  }

  // 3. Analyse NLP de chaque chunk/section
  const sections: (GameSection & Partial<StoredSection>)[] = [];
  const allMechanics = new Set<GameMechanic>();

  for (const [index, item] of processingItems.entries()) {
    const section = item.originalSection;
    const displayTitle = withChunking && item.metadata.totalChunks > 1
      ? `${section.titre} [${item.metadata.chunkIndex + 1}/${item.metadata.totalChunks}]`
      : section.titre;

    onSection?.(index, processingItems.length, displayTitle);

    const nlpResult = await analyzeText(item.content);
    const mecaniques = detectMechanics(item.content);
    mecaniques.forEach(m => allMechanics.add(m));

    const enriched: GameSection & Partial<StoredSection> = {
      titre: section.titre,
      niveau: section.niveau,
      type_section: classifySection(section.titre, item.content),
      contenu: item.content,
      entites: nlpResult.entites,
      actions: nlpResult.actions,
      resume: nlpResult.resume,
      mecaniques,
      page_debut: section.page_debut,
      page_fin: section.page_fin,
    };

    // Ajoute les métadonnées de chunking si activé
    if (withChunking) {
      enriched.hierarchy_path = item.metadata.hierarchyPath;
      enriched.chunk_index = item.metadata.chunkIndex;
      enriched.total_chunks = item.metadata.totalChunks;
    }

    if (withEmbed) {
      try {
        // Enrichit le contenu avec la hiérarchie pour l'embedding
        const contentForEmbedding = withChunking
          ? enrichChunkContent(item as any, true)
          : item.content;
        enriched.embedding = await generateEmbedding(contentForEmbedding);
      } catch {
        enriched.embedding = null;
      }
    }

    sections.push(enriched);
  }

  return {
    jeu: gameName,
    fichier: filePath,
    date_analyse: new Date().toISOString(),
    metadata,
    statistiques: {
      caracteres: rawText.length,
      mots: rawText.split(/\s+/).filter(Boolean).length,
      sections: sections.length,
      entites_total: [...new Set(sections.flatMap(s => s.entites))].length,
      actions_total: [...new Set(sections.flatMap(s => s.actions))].length,
      mecaniques_detectees: [...allMechanics],
    },
    sections,
  };
}
