/**
 * contextBuilder.ts — Construction de contexte enrichi pour le LLM
 *
 * Transforme les sections récupérées en un prompt optimisé pour le LLM,
 * incluant toutes les métadonnées disponibles : hiérarchie, chunking, NLP,
 * pages sources, scores de pertinence.
 *
 * Améliorations par rapport au contexte basique :
 *   ✅ Hiérarchie complète (hierarchy_path)
 *   ✅ Métadonnées de chunking (chunk X/Y)
 *   ✅ Entités et actions NLP
 *   ✅ Pages sources précises
 *   ✅ Scores de pertinence
 *   ✅ Résumé extractif (si disponible)
 *   ✅ Découpage intelligent (fin de phrase au lieu de slice brut)
 */

import type { ScoredSection } from '../types';

// ── Configuration ─────────────────────────────────────────────────────────────

/** Nombre max de caractères de contenu par section (approximatif) */
const MAX_CONTENT_CHARS = 1000;

/** Nombre max d'entités NLP à afficher par section */
const MAX_ENTITIES = 8;

/** Nombre max d'actions NLP à afficher par section */
const MAX_ACTIONS = 6;

// ── Utilitaires ───────────────────────────────────────────────────────────────

/**
 * Découpe le texte pour ne garder que les N premiers caractères,
 * en coupant à la fin d'une phrase complète pour préserver la cohérence.
 */
function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const truncated = text.slice(0, maxChars);

  // Cherche le dernier point, point-virgule, ou point d'exclamation/interrogation
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('.\n'),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
    truncated.lastIndexOf('; ')
  );

  if (lastSentenceEnd > maxChars * 0.6) {
    // Si on trouve une fin de phrase dans les 60% du texte, on coupe là
    return truncated.slice(0, lastSentenceEnd + 1).trim();
  }

  // Sinon, coupe au dernier espace pour éviter de couper un mot
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.8) {
    return `${truncated.slice(0, lastSpace).trim()}…`;
  }

  return `${truncated.trim()}…`;
}

/**
 * Formate un score de pertinence en pourcentage lisible.
 */
function formatScore(score: number): string {
  return `${(score * 100).toFixed(0)}%`;
}

/**
 * Formate une plage de pages.
 */
function formatPages(debut?: number, fin?: number): string {
  if (!debut) return '';
  if (!fin || fin === debut) return `p.${debut}`;
  return `p.${debut}–${fin}`;
}

/**
 * Formate une liste d'éléments avec limitation.
 */
function formatList(items: string[], maxItems: number): string {
  if (items.length === 0) return '';
  const displayed = items.slice(0, maxItems);
  const remaining = items.length - displayed.length;
  const list = displayed.join(', ');
  return remaining > 0 ? `${list} (+${remaining} autres)` : list;
}

// ── Construction de contexte ──────────────────────────────────────────────────

/**
 * Construit le contexte enrichi pour une seule section.
 */
function buildSectionContext(
  scoredSection: ScoredSection,
  index: number,
  gameName: string
): string {
  const { section, score } = scoredSection;
  const lines: string[] = [];

  // ── En-tête de section ────────────────────────────────────────────────────

  lines.push(`╔═══════════════════════════════════════════════════════════════════════`);
  lines.push(`║ SECTION ${index + 1} — Pertinence : ${formatScore(score)}`);
  lines.push(`╠═══════════════════════════════════════════════════════════════════════`);

  // ── Métadonnées de base ───────────────────────────────────────────────────

  lines.push(`║ Jeu           : ${gameName}`);
  lines.push(`║ Titre         : ${section.titre}`);
  lines.push(`║ Type          : ${section.type_section}`);

  const pages = formatPages(section.page_debut, section.page_fin);
  if (pages) {
    lines.push(`║ Pages         : ${pages}`);
  }

  // ── Métadonnées de chunking ───────────────────────────────────────────────

  if (section.hierarchy_path) {
    lines.push(`║ Hiérarchie    : ${section.hierarchy_path}`);
  }

  if (section.chunk_index !== undefined && section.total_chunks !== undefined) {
    const chunkInfo = `Chunk ${section.chunk_index + 1}/${section.total_chunks}`;
    lines.push(`║ Fragmentation : ${chunkInfo}`);
  }

  // ── Métadonnées NLP ───────────────────────────────────────────────────────

  if (section.entites && section.entites.length > 0) {
    const entities = formatList(section.entites, MAX_ENTITIES);
    lines.push(`║ Entités       : ${entities}`);
  }

  if (section.actions && section.actions.length > 0) {
    const actions = formatList(section.actions, MAX_ACTIONS);
    lines.push(`║ Actions       : ${actions}`);
  }

  if (section.mecaniques && section.mecaniques.length > 0) {
    const mecaniques = section.mecaniques.join(', ');
    lines.push(`║ Mécaniques    : ${mecaniques}`);
  }

  lines.push(`╚═══════════════════════════════════════════════════════════════════════`);

  // ── Résumé (si disponible) ────────────────────────────────────────────────

  if (section.resume && section.resume.trim().length > 0) {
    lines.push('');
    lines.push('📝 RÉSUMÉ :');
    lines.push(section.resume);
  }

  // ── Contenu détaillé ──────────────────────────────────────────────────────

  lines.push('');
  lines.push('📖 CONTENU DÉTAILLÉ :');

  const content = truncateAtSentence(section.contenu, MAX_CONTENT_CHARS);
  lines.push(content);

  // Si le contenu a été tronqué, indiquer qu'il y a plus de contenu
  if (section.contenu.length > MAX_CONTENT_CHARS) {
    lines.push('');
    lines.push('[… contenu additionnel disponible dans la section complète]');
  }

  return lines.join('\n');
}

/**
 * Construit le contexte enrichi complet à partir des sections récupérées.
 *
 * @param sections - Sections avec scores de pertinence
 * @param gameName - Nom du jeu (pour affichage)
 * @param gameMetadata - Métadonnées du jeu (optionnel)
 * @returns Contexte formaté prêt pour le LLM
 */
export function buildEnrichedContext(
  sections: ScoredSection[],
  gameName: string,
  gameMetadata?: {
    joueurs_min?: number | null;
    joueurs_max?: number | null;
    age_minimum?: number | null;
    duree_minutes_min?: number | null;
    duree_minutes_max?: number | null;
  }
): string {
  if (sections.length === 0) {
    return 'Aucune section pertinente trouvée.';
  }

  const lines: string[] = [];

  // ── En-tête global ────────────────────────────────────────────────────────

  lines.push('═════════════════════════════════════════════════════════════════════════');
  lines.push(`  CONTEXTE ENRICHI — ${gameName.toUpperCase()}`);
  lines.push('═════════════════════════════════════════════════════════════════════════');

  // ── Métadonnées du jeu ────────────────────────────────────────────────────

  if (gameMetadata) {
    const meta: string[] = [];

    if (gameMetadata.joueurs_min || gameMetadata.joueurs_max) {
      const min = gameMetadata.joueurs_min ?? '?';
      const max = gameMetadata.joueurs_max ?? '?';
      meta.push(`Joueurs: ${min}–${max}`);
    }

    if (gameMetadata.age_minimum) {
      meta.push(`Âge: ${gameMetadata.age_minimum}+`);
    }

    if (gameMetadata.duree_minutes_min || gameMetadata.duree_minutes_max) {
      const min = gameMetadata.duree_minutes_min ?? '?';
      const max = gameMetadata.duree_minutes_max ?? '?';
      if (min === max) {
        meta.push(`Durée: ${min} min`);
      } else {
        meta.push(`Durée: ${min}–${max} min`);
      }
    }

    if (meta.length > 0) {
      lines.push('');
      lines.push(`📊 ${meta.join(' • ')}`);
    }
  }

  lines.push('');
  lines.push(
    `📚 ${sections.length} section${sections.length > 1 ? 's' : ''} pertinente${sections.length > 1 ? 's' : ''} trouvée${sections.length > 1 ? 's' : ''} :`
  );
  lines.push('');

  // ── Sections détaillées ───────────────────────────────────────────────────

  for (let i = 0; i < sections.length; i++) {
    if (i > 0) {
      lines.push('');
      lines.push('');
    }
    lines.push(buildSectionContext(sections[i], i, gameName));
  }

  // ── Pied de page ──────────────────────────────────────────────────────────

  lines.push('');
  lines.push('═════════════════════════════════════════════════════════════════════════');
  lines.push('  FIN DU CONTEXTE');
  lines.push('═════════════════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Version simplifiée du contexte (format compact, sans boxes).
 * Utile si le contexte enrichi est too verbose pour certains LLMs.
 */
export function buildCompactContext(sections: ScoredSection[]): string {
  if (sections.length === 0) {
    return 'Aucune section pertinente trouvée.';
  }

  return sections
    .map((scoredSection, i) => {
      const { section, score } = scoredSection;
      const parts: string[] = [];

      // En-tête compact
      parts.push(`[SECTION ${i + 1} — ${formatScore(score)}]`);
      parts.push(`Titre: ${section.titre} (${section.type_section})`);

      // Hiérarchie si disponible
      if (section.hierarchy_path) {
        parts.push(`Hiérarchie: ${section.hierarchy_path}`);
      }

      // Chunking si disponible
      if (section.chunk_index !== undefined && section.total_chunks !== undefined) {
        parts.push(`Chunk ${section.chunk_index + 1}/${section.total_chunks}`);
      }

      // Pages si disponibles
      const pages = formatPages(section.page_debut, section.page_fin);
      if (pages) parts.push(pages);

      // Résumé ou contenu
      parts.push('');
      if (section.resume && section.resume.trim().length > 0) {
        parts.push(section.resume);
        parts.push('');
      }

      const content = truncateAtSentence(section.contenu, MAX_CONTENT_CHARS);
      parts.push(content);

      return parts.join('\n');
    })
    .join('\n\n---\n\n');
}

/**
 * Type d'export pour faciliter l'utilisation.
 */
export interface ContextBuilderOptions {
  /** Format de contexte : 'enriched' (défaut) ou 'compact' */
  format?: 'enriched' | 'compact';
  /** Métadonnées du jeu (optionnel) */
  gameMetadata?: {
    joueurs_min?: number | null;
    joueurs_max?: number | null;
    age_minimum?: number | null;
    duree_minutes_min?: number | null;
    duree_minutes_max?: number | null;
  };
}

/**
 * Point d'entrée principal : construit le contexte selon les options.
 */
export function buildContext(
  sections: ScoredSection[],
  gameName: string,
  options: ContextBuilderOptions = {}
): string {
  const { format = 'enriched', gameMetadata } = options;

  if (format === 'compact') {
    return buildCompactContext(sections);
  }

  return buildEnrichedContext(sections, gameName, gameMetadata);
}
