/**
 * pipeline.ts — Logique d'analyse partagée entre les commandes
 *
 * Utilisé par :
 *   - analyser.ts  (sortie standalone vers resultat.json)
 *   - commands/add.ts  (indexation dans la knowledge base)
 */

import { extractText } from './modules/textExtractor';
import { parseSections, classifySection } from './modules/sectionParser';
import { analyzeText, detectMechanics } from './modules/nlpProcessor';
import { extractGameMetadata, extractGameName } from './modules/gameExtractor';
import { generateEmbedding } from './modules/embedder';
import type { GameAnalysisResult, GameSection, GameMechanic } from './types';

export interface PipelineOptions {
  /** Active la génération d'embeddings OpenAI ou TF-IDF dense */
  withEmbed?: boolean;
  /** Callback appelé à chaque section pour afficher la progression */
  onSection?: (index: number, total: number, titre: string) => void;
}

/**
 * Pipeline complet : extraction → sections → NLP → résultat structuré.
 * Fonction pure (pas de console.log interne).
 */
export async function analyseFile(
  filePath: string,
  options: PipelineOptions = {},
): Promise<GameAnalysisResult> {
  const { withEmbed = false, onSection } = options;

  // 1. Extraction du texte
  const rawText = await extractText(filePath);
  const gameName = extractGameName(rawText);
  const metadata = extractGameMetadata(rawText);

  // 2. Découpage en sections
  const rawSections = parseSections(rawText, gameName);

  // 3. Analyse NLP de chaque section
  const sections: GameSection[] = [];
  const allMechanics = new Set<GameMechanic>();

  for (const [index, section] of rawSections.entries()) {
    onSection?.(index, rawSections.length, section.titre);

    const nlpResult = analyzeText(section.contenu);
    const mecaniques = detectMechanics(section.contenu);
    mecaniques.forEach(m => allMechanics.add(m));

    const enriched: GameSection = {
      titre: section.titre,
      niveau: section.niveau,
      type_section: classifySection(section.titre),
      contenu: section.contenu,
      entites: nlpResult.entites,
      actions: nlpResult.actions,
      resume: nlpResult.resume,
      mecaniques,
    };

    if (withEmbed) {
      try {
        enriched.embedding = await generateEmbedding(section.contenu);
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
