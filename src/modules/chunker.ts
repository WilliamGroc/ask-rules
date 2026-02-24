/**
 * chunker.ts — Chunking intelligent et hiérarchique pour optimiser le RAG
 *
 * Stratégies implémentées :
 *   1. Chunks de taille optimale (200-400 mots) pour les embeddings
 *   2. Overlap entre chunks (50-100 mots) pour préserver le contexte
 *   3. Respect des limites de phrases (pas de coupure au milieu)
 *   4. Préservation de la hiérarchie (titres parents inclus)
 *   5. Split intelligent par paragraphes puis par phrases
 *
 * Avantages vs découpage statique :
 *   - Meilleure granularité → résultats plus précis
 *   - Overlap → moins de perte d'information aux frontières
 *   - Contexte hiérarchique → améliore la compréhension LLM
 *   - Chunks uniformes → embeddings plus cohérents
 */

import type { RawSection, GameSection } from '../types';

// ── Configuration ─────────────────────────────────────────────────────────────

/** Taille cible d'un chunk en mots (optimisé pour embeddings 384d) */
const CHUNK_TARGET_WORDS = 300;
/** Taille maximale avant split obligatoire */
const CHUNK_MAX_WORDS = 450;
/** Taille minimale d'un chunk (en-dessous, on fusionne avec le précédent) */
const CHUNK_MIN_WORDS = 100;
/** Nombre de mots d'overlap entre chunks consécutifs */
const CHUNK_OVERLAP_WORDS = 75;

// ── Utilitaires ───────────────────────────────────────────────────────────────

/** Compte les mots dans un texte */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Découpe un texte en phrases (approximation par ponctuation forte) */
function splitIntoSentences(text: string): string[] {
  // Split sur . ! ? suivi d'espace ou fin, mais pas sur "M.", "Dr.", etc.
  const sentences: string[] = [];
  const parts = text.split(/([.!?]+\s+|[.!?]+$)/);

  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? '';
    const punct = parts[i + 1] ?? '';
    const full = (sentence + punct).trim();

    if (full.length > 0) {
      // Ignore les faux splits (abréviations courantes)
      const lastWord = sentence.trim().split(/\s+/).pop() ?? '';
      if (/^(M|Mme|Dr|Sr|Jr|etc|ex|vs|p|vol|n°)$/i.test(lastWord.replace(/\.$/, ''))) {
        // Continue à accumuler
        if (i === 0) {
          sentences.push(full);
        } else if (sentences.length > 0) {
          sentences[sentences.length - 1] += ' ' + full;
        }
      } else {
        sentences.push(full);
      }
    }
  }

  return sentences.filter(s => s.length > 0);
}

/** Découpe un texte en paragraphes */
function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Construit le chemin hiérarchique complet d'une section
 * Ex: sections[2] avec parent sections[0] → "MATÉRIEL > Cartes"
 */
function buildHierarchyPath(
  sections: RawSection[],
  currentIndex: number,
): string {
  const current = sections[currentIndex];
  if (!current) return '';

  const path: string[] = [current.titre];

  // Remonte la hiérarchie en cherchant les parents (niveau inférieur)
  for (let i = currentIndex - 1; i >= 0; i--) {
    const candidate = sections[i];
    if (candidate.niveau < current.niveau) {
      path.unshift(candidate.titre);
      // Continue à remonter si on n'est pas au niveau 1
      if (candidate.niveau === 1) break;
    }
  }

  return path.join(' > ');
}

/**
 * Extrait les N premiers mots d'un texte
 */
function takeWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  return words.slice(0, maxWords).join(' ');
}

/**
 * Extrait les N derniers mots d'un texte
 */
function takeLastWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  return words.slice(-maxWords).join(' ');
}

// ── Chunking principal ────────────────────────────────────────────────────────

export interface ChunkMetadata {
  /** Index du chunk pour cette section (0, 1, 2...) */
  chunkIndex: number;
  /** Nombre total de chunks pour cette section */
  totalChunks: number;
  /** Chemin hiérarchique complet (ex: "MATÉRIEL > Cartes > Événements") */
  hierarchyPath: string;
  /** ID de la section parent (pour reconstruction) */
  parentSectionId?: string;
}

export interface Chunk {
  /** Contenu du chunk (avec overlap éventuel) */
  content: string;
  /** Métadonnées de chunking */
  metadata: ChunkMetadata;
  /** Section d'origine */
  originalSection: RawSection;
}

/**
 * Découpe une section en chunks intelligents avec overlap.
 * 
 * Algorithme :
 *   1. Si section < CHUNK_MIN_WORDS → retourne tel quel (1 chunk)
 *   2. Si section < CHUNK_MAX_WORDS → retourne tel quel (1 chunk)
 *   3. Sinon :
 *      a. Découpe par paragraphes
 *      b. Accumule les paragraphes jusqu'à CHUNK_TARGET_WORDS
 *      c. Si un paragraphe dépasse CHUNK_MAX_WORDS → découpe par phrases
 *      d. Ajoute overlap des derniers mots du chunk précédent
 */
function chunkSection(
  section: RawSection,
  hierarchyPath: string,
): Chunk[] {
  const wordCount = countWords(section.contenu);

  // Cas 1 & 2 : Section petite ou moyenne → 1 chunk
  if (wordCount <= CHUNK_MAX_WORDS) {
    return [{
      content: section.contenu,
      metadata: {
        chunkIndex: 0,
        totalChunks: 1,
        hierarchyPath,
      },
      originalSection: section,
    }];
  }

  // Cas 3 : Section grande → chunking intelligent
  const chunks: Chunk[] = [];
  const paragraphs = splitIntoParagraphs(section.contenu);

  let currentContent = '';
  let overlapBuffer = ''; // Derniers mots du chunk précédent

  for (const paragraph of paragraphs) {
    const paraWords = countWords(paragraph);
    const currentWords = countWords(currentContent);

    // Si le paragraphe seul dépasse la limite → découpe par phrases
    if (paraWords > CHUNK_MAX_WORDS) {
      // Flush le chunk en cours si non vide
      if (currentWords >= CHUNK_MIN_WORDS) {
        chunks.push({
          content: currentContent.trim(),
          metadata: {
            chunkIndex: chunks.length,
            totalChunks: 0, // Sera mis à jour à la fin
            hierarchyPath,
          },
          originalSection: section,
        });
        overlapBuffer = takeLastWords(currentContent, CHUNK_OVERLAP_WORDS);
        currentContent = '';
      }

      // Découpe le paragraphe en phrases
      const sentences = splitIntoSentences(paragraph);
      let sentenceBuffer = overlapBuffer;

      for (const sentence of sentences) {
        const bufferWords = countWords(sentenceBuffer);
        const sentenceWords = countWords(sentence);

        if (bufferWords + sentenceWords > CHUNK_MAX_WORDS && bufferWords >= CHUNK_MIN_WORDS) {
          // Flush le buffer
          chunks.push({
            content: sentenceBuffer.trim(),
            metadata: {
              chunkIndex: chunks.length,
              totalChunks: 0,
              hierarchyPath,
            },
            originalSection: section,
          });
          sentenceBuffer = takeLastWords(sentenceBuffer, CHUNK_OVERLAP_WORDS) + ' ' + sentence;
        } else {
          sentenceBuffer += (sentenceBuffer ? ' ' : '') + sentence;
        }
      }

      // Garde le reste pour le prochain paragraphe
      currentContent = sentenceBuffer;
      continue;
    }

    // Paragraphe normal
    if (currentWords + paraWords > CHUNK_TARGET_WORDS && currentWords >= CHUNK_MIN_WORDS) {
      // Flush le chunk actuel
      chunks.push({
        content: currentContent.trim(),
        metadata: {
          chunkIndex: chunks.length,
          totalChunks: 0,
          hierarchyPath,
        },
        originalSection: section,
      });
      overlapBuffer = takeLastWords(currentContent, CHUNK_OVERLAP_WORDS);
      currentContent = overlapBuffer + (overlapBuffer ? '\n\n' : '') + paragraph;
    } else {
      currentContent += (currentContent ? '\n\n' : '') + paragraph;
    }
  }

  // Flush le dernier chunk
  if (countWords(currentContent) >= CHUNK_MIN_WORDS) {
    chunks.push({
      content: currentContent.trim(),
      metadata: {
        chunkIndex: chunks.length,
        totalChunks: 0,
        hierarchyPath,
      },
      originalSection: section,
    });
  } else if (chunks.length > 0) {
    // Trop petit → fusionne avec le dernier chunk
    chunks[chunks.length - 1].content += '\n\n' + currentContent;
  }

  // Met à jour totalChunks
  chunks.forEach(chunk => {
    chunk.metadata.totalChunks = chunks.length;
  });

  return chunks;
}

/**
 * Découpe toutes les sections en chunks avec hiérarchie préservée.
 * 
 * @param sections - Sections brutes du parseSections()
 * @returns Array de chunks avec métadonnées enrichies
 */
export function chunkSections(sections: RawSection[]): Chunk[] {
  const allChunks: Chunk[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const hierarchyPath = buildHierarchyPath(sections, i);
    const sectionChunks = chunkSection(section, hierarchyPath);
    allChunks.push(...sectionChunks);
  }

  return allChunks;
}

/**
 * Enrichit un chunk avec le contexte hiérarchique dans son contenu.
 * Ajoute un préambule avec le chemin de navigation.
 * 
 * Utile pour améliorer la qualité des embeddings et la compréhension LLM.
 * 
 * @param chunk - Chunk à enrichir
 * @param includeMetadata - Si true, ajoute des métadonnées en préambule
 * @returns Contenu enrichi prêt pour l'embedding
 */
export function enrichChunkContent(
  chunk: Chunk,
  includeMetadata = true,
): string {
  if (!includeMetadata) {
    return chunk.content;
  }

  const parts: string[] = [];

  // Ajoute le chemin hiérarchique comme contexte
  if (chunk.metadata.hierarchyPath) {
    parts.push(`[${chunk.metadata.hierarchyPath}]`);
  }

  // Ajoute l'indicateur de chunk si multi-chunk
  if (chunk.metadata.totalChunks > 1) {
    parts.push(
      `(Partie ${chunk.metadata.chunkIndex + 1}/${chunk.metadata.totalChunks})`,
    );
  }

  parts.push(''); // Ligne vide
  parts.push(chunk.content);

  return parts.join('\n');
}

/**
 * Statistiques de chunking pour debug/monitoring
 */
export function getChunkingStats(chunks: Chunk[]): {
  totalChunks: number;
  avgWordsPerChunk: number;
  minWords: number;
  maxWords: number;
  chunksWithOverlap: number;
} {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      avgWordsPerChunk: 0,
      minWords: 0,
      maxWords: 0,
      chunksWithOverlap: 0,
    };
  }

  const wordCounts = chunks.map(c => countWords(c.content));
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);

  return {
    totalChunks: chunks.length,
    avgWordsPerChunk: Math.round(totalWords / chunks.length),
    minWords: Math.min(...wordCounts),
    maxWords: Math.max(...wordCounts),
    chunksWithOverlap: chunks.filter(c => c.metadata.chunkIndex > 0).length,
  };
}
