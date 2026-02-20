/**
 * sectionParser.ts — Découpage d'un texte de règles en sections.
 *
 * Niveaux de titres reconnus (ordre de priorité) :
 *   1. Markdown #/##/###                → niveau 1/2/3
 *   2. ALL-CAPS ≥ 2 mots               → niveau 1  (MATÉRIEL, TOUR DE JEU)
 *   3. Étape N — ...                   → niveau 2
 *   4. "Titre :" ≤ 6 mots heuristique  → niveau 2  (Phase de Collecte :)
 *   5. Numéroté "N. / N)" sans article → niveau 2  (1. Phase de jeu)
 *   6. Titre-case + contexte de blanc  → niveau 2  (Composants du Jeu)
 *
 * Rejets explicites (anti-faux-positifs) :
 *   - Titre commençant par un article / pronom / préposition français
 *   - Titre commençant par un verbe impératif (-ez) ou infinitif (-er/-ir/-re)
 *   - Ligne de > 7 mots
 *   - "N) Le joueur..." → numéro suivi d'un article → item de liste, pas un titre
 *   - Artefacts PDF multi-colonnes : "H", "hH", "23", "4 5", isolés
 */

import type { RawSection, GameSectionType } from '../types';

// ── Filtrage de lignes parasites ──────────────────────────────────────────────

/**
 * Détecte les lignes non significatives :
 *   - Séparateurs visuels (===, ---, ***)
 *   - Numéros de page ("Page 3")
 *   - Artefacts de PDF 2 colonnes : "H", "hH", "23", "45"
 *   - Lignes ≤ 2 chars (fragments PDF, ponctuations isolées)
 *   - Ponctuations seules (";", ".", ")")
 */
const NOISE_LINE = /^([=\-*#~_]{3,}|Page\s+\d+|[hH\d\s]{1,6}|[^\w]{1,3})$/i;

function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;   // blank lines are handled separately
  if (t.length <= 2) return true;     // "H", "h", "2", ";", "—", ") "
  return NOISE_LINE.test(t);
}

// ── Mots indicateurs de contenu (pas de titre) ───────────────────────────────

/**
 * Premier mot qui indique que la ligne est du contenu (phrase), pas un titre.
 * Si une ligne commence par un de ces mots, elle n'est PAS un titre.
 */
const CONTENT_FIRST_WORDS = new Set([
  // Articles
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de',
  // Prépositions
  'au', 'aux', 'en', 'dans', 'à', 'a', 'pour', 'par', 'avec', 'sans',
  'vers', 'chez', 'depuis', 'lors', 'après', 'avant', 'pendant',
  // Pronoms personnels / démonstratifs
  'il', 'elle', 'ils', 'elles', 'on', 'ce', 'cet', 'cette', 'ces',
  'son', 'sa', 'ses', 'mon', 'ma', 'ton', 'ta',
  // Conjonctions
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'si',
  'que', 'qui', 'lorsque', 'quand', 'comme', 'puisque', 'car',
  // Négation
  'ne', 'pas', 'non',
  // Adverbes ou introducteurs de phrase
  'c', 'j', 'y', 'voici', 'voilà', 'notamment',
]);

/** Retourne le premier mot (minuscule, sans ponctuation) d'un texte. */
function firstWord(text: string): string {
  return (text.split(/[\s,.:;!?()\[\]«»"']+/)[0] ?? '').toLowerCase();
}

/** True si la ligne démarre clairement par un contenu (article, pronom…). */
function isContentStarter(text: string): boolean {
  return CONTENT_FIRST_WORDS.has(firstWord(text));
}

/**
 * True si la ligne démarre par un verbe impératif (-ez) ou infinitif (-er/-ir/-oir/-re).
 * Exemples : "Donnez", "Donner", "Placer", "Choisissez"
 * Exclusions : mots se terminant en -oire / -aire / -ière (noms/adjectifs, pas des verbes)
 *   ex : "Territoire", "Victoire", "Ordinaire"
 */
function isVerbStarter(text: string): boolean {
  const fw = text.split(/\s+/)[0] ?? '';
  if (/oire$|aire$|ière$/i.test(fw)) return false;   // noms/adj courants, pas des verbes
  return /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜ][a-zàâéèêëîïôùûü]{2,}(ez|er|ir|oir|re)$/u.test(fw);
}

/** Compte le nombre de mots dans une chaîne. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Normalisation des titres ──────────────────────────────────────────────────

/**
 * Normalise un titre détecté :
 *   - Supprime le deux-points final "Titre :" → "Titre"
 *   - Supprime les espaces multiples
 */
function normalizeTitle(raw: string): string {
  return raw
    .replace(/\s*:\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Détection ALL-CAPS ────────────────────────────────────────────────────────

/**
 * True si le texte est majoritairement en majuscules (hors espaces, ponctuation).
 * Exemples : "MATÉRIEL", "TOUR DE JEU", "LES CINQ TOURS DE JEU"
 */
function isAllCaps(text: string): boolean {
  const alpha = text.replace(/[\s\d\-:/()'"«»''.,!?_]+/g, '');
  if (alpha.length < 3) return false;   // "VP", "OK" → trop court pour être un titre
  return alpha === alpha.toUpperCase() && alpha !== alpha.toLowerCase();
}

// ── Interface de résultat ─────────────────────────────────────────────────────

interface HeadingResult {
  isHeading: boolean;
  title: string;
  niveau: 1 | 2 | 3;
}

interface DetectContext {
  prevWasBlank: boolean;
}

// ── Détection de titre ────────────────────────────────────────────────────────

function detectHeading(line: string, ctx: DetectContext): HeadingResult {
  const trimmed = line.trim();
  const none: HeadingResult = { isHeading: false, title: '', niveau: 2 };
  if (trimmed.length === 0) return none;

  // 1. Markdown ## Titre
  const mdMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (mdMatch) {
    const level = Math.min(mdMatch[1].length, 3) as 1 | 2 | 3;
    return { isHeading: true, title: normalizeTitle(mdMatch[2]), niveau: level };
  }

  // 2. ALL-CAPS : MATÉRIEL / TOUR DE JEU / LES 5 TOURS
  if (isAllCaps(trimmed) && wordCount(trimmed) <= 9 && trimmed.length >= 3) {
    const niveau: 1 | 2 = wordCount(trimmed) >= 2 ? 1 : 2;
    return { isHeading: true, title: normalizeTitle(trimmed), niveau };
  }

  // 3. "Étape N — ..." pattern
  const etapeMatch = trimmed.match(/^(Étape\s+\d+\s*[—\-]\s*[^:]+?)\s*:?\s*$/i);
  if (etapeMatch) {
    return { isHeading: true, title: normalizeTitle(etapeMatch[1]), niveau: 2 };
  }

  // 4. "Titre :" heuristique
  //    Conditions : ≤ 6 mots, ne commence pas par article/pronom/verbe, pas de virgule interne
  const titreColonMatch = trimmed.match(/^([A-ZÀÂÉÈÊËÎÏÔÙÛÜ][^.!?\n]{2,60})\s*:\s*$/);
  if (titreColonMatch) {
    const candidate = titreColonMatch[1].trim();
    const wc = wordCount(candidate);
    if (
      wc <= 6 &&
      !isContentStarter(candidate) &&
      !isVerbStarter(candidate) &&
      !candidate.includes(', ')          // virgule interne = phrase, pas un titre
    ) {
      return { isHeading: true, title: normalizeTitle(candidate), niveau: 2 };
    }
  }

  // 5. Numéroté "N. Titre" ou "N) Titre"
  //    Rejeté si le titre commence par un article/pronom (item de liste, pas un titre)
  const numMatch = trimmed.match(/^(\d+(?:\.\d+)*)[.)]\s+(.{3,60})$/);
  if (numMatch) {
    const candidate = numMatch[2].trim();
    const wc = wordCount(candidate);
    if (
      wc <= 7 &&
      !isContentStarter(candidate) &&
      !isVerbStarter(candidate) &&
      !/[.!?]$/.test(candidate)        // ne se termine pas comme une phrase
    ) {
      return { isHeading: true, title: normalizeTitle(candidate), niveau: 2 };
    }
  }

  // 6. Titre en casse mixte, ligne précédée d'un blanc
  //    Conditions : 2-6 mots, commence par majuscule, pas article/verbe, pas ponctuation finale
  //    Rejet : ligne contenant ", " (virgule = probablement une phrase)
  if (ctx.prevWasBlank) {
    const wc = wordCount(trimmed);
    if (
      wc >= 2 && wc <= 6 &&
      /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜ]/.test(trimmed) &&
      !isContentStarter(trimmed) &&
      !isVerbStarter(trimmed) &&
      !/[.!?;]$/.test(trimmed) &&          // pas de ponctuation de fin de phrase
      !trimmed.includes(', ')              // virgule = phrase, pas un titre
    ) {
      return { isHeading: true, title: normalizeTitle(trimmed), niveau: 2 };
    }
  }

  return none;
}

// ── Classification sémantique ─────────────────────────────────────────────────

/**
 * Classifie une section par son titre (correspondance de mots-clés, sans accents).
 */
export function classifySection(titre: string): GameSectionType {
  const t = titre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/presentation|introduction|idee.?du.?jeu|contexte|propos/.test(t)) return 'presentation';
  if (/but.?du.?jeu|objectif|remporter|gagner.?partie/.test(t))          return 'but_du_jeu';
  if (/materiel|composant|contenu.?boite|piece|hex|tuile|plateau/.test(t)) return 'materiel';
  if (/mise.?en.?place|preparation|demarrage|avant.?partie|setup/.test(t)) return 'preparation';
  if (/tour.?de.?jeu|deroulement|phase|action|recrut|construir|attaqu|commerc|passer|mecanique/.test(t)) return 'tour_de_jeu';
  if (/carte.?evenement|evenement/.test(t))                               return 'cartes_evenement';
  if (/regle.?speciale|exception|cas.?particulier|surpopulation|alliance|territoire.?neutre/.test(t)) return 'regles_speciales';
  if (/condition.?victoire|fin.?partie|decompte|score|gagnant|victoire/.test(t)) return 'victoire';
  if (/variante|mode.?cooper|optionnel|coop/.test(t))                     return 'variante';
  if (/conseil|strategi|astuce|recommandation/.test(t))                   return 'conseils';

  return 'autre';
}

// ── Découpage principal ───────────────────────────────────────────────────────

/**
 * Découpe le texte brut en sections hiérarchisées.
 *
 * @param rawText      - Texte extrait du fichier (PDF ou TXT)
 * @param documentName - Nom du document (titre de la section racine)
 */
export function parseSections(rawText: string, documentName = 'Jeu'): RawSection[] {
  const rawLines = rawText.split(/\r?\n/);

  // Pré-filtrage : retirer les lignes parasites
  const lines = rawLines.filter(l => !isNoiseLine(l));

  const sections: RawSection[] = [];
  let currentTitle   = documentName;
  let currentNiveau: 1 | 2 | 3 = 1;
  let currentContent: string[] = [];
  let prevWasBlank   = true; // début de document = comme si précédé d'un blanc

  for (const line of lines) {
    const isBlank = line.trim().length === 0;

    const { isHeading, title, niveau } = detectHeading(line, { prevWasBlank });

    if (isHeading) {
      // Flush la section courante si elle a du contenu
      const content = currentContent.join('\n').trim();
      if (content.length > 0) {
        sections.push({ titre: currentTitle, contenu: content, niveau: currentNiveau });
      }
      currentTitle   = title;
      currentNiveau  = niveau;
      currentContent = [];
    } else {
      currentContent.push(line);
    }

    prevWasBlank = isBlank;
  }

  // Flush de la dernière section
  const content = currentContent.join('\n').trim();
  if (content.length > 0) {
    sections.push({ titre: currentTitle, contenu: content, niveau: currentNiveau });
  }

  // Filtre les sections trop courtes (artefacts ou listes de 1-2 mots)
  return sections.filter(s => s.contenu.split(/\s+/).length >= 5);
}
