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
 * Post-traitement :
 *   1. Look-ahead : titre non confirmé si < MIN_LOOKAHEAD_WORDS mots le suivent
 *   2. Merge : sections < MERGE_THRESHOLD mots fusionnées dans la précédente
 *   3. Split : sections > MAX_SECTION_WORDS mots découpées par paragraphes
 *
 * Rejets explicites (anti-faux-positifs) :
 *   - Titre commençant par un article / pronom / préposition français
 *   - Titre commençant par un verbe impératif (-ez) ou infinitif (-er/-ir/-re)
 *   - Ligne de > 7 mots
 *   - "N) Le joueur..." → numéro suivi d'un article → item de liste, pas un titre
 *   - Artefacts PDF multi-colonnes : "H", "hH", "23", "4 5", isolés
 */

import type { RawSection, GameSectionType } from '../types';

// ── Constantes de découpage ───────────────────────────────────────────────────

/** Nombre minimal de mots de contenu qui doivent suivre un titre pour le valider. */
const MIN_LOOKAHEAD_WORDS = 10;  // Réduit pour pdfreader - découpage plus fin
/** Sections avec moins de mots sont écartées (artefacts, listes de 1-2 mots). */
const MIN_SECTION_WORDS = 15;    // Réduit pour permettre des sections plus petites
/** Sections avec moins de mots sont fusionnées dans la précédente. */
const MERGE_THRESHOLD = 25;      // Réduit pour éviter de fusionner trop de sections
/** Sections avec plus de mots sont découpées par paragraphes. */
const MAX_SECTION_WORDS = 350;   // Réduit de 600 pour un découpage plus fin
/** Taille cible d'un chunk lors de la division (en mots). */
const CHUNK_TARGET_WORDS = 200;  // Réduit de 400 pour des chunks plus petits

// ── Filtrage de lignes parasites ──────────────────────────────────────────────

/**
 * Détecte les lignes non significatives :
 *   - Séparateurs visuels (===, ---, ***)
 *   - Numéros de page ("Page 3")
 *   - Artefacts de PDF 2 colonnes : "H", "hH", "23", "45", "23HhHh", etc.
 *   - Lignes ≤ 2 chars (fragments PDF, ponctuations isolées)
 *   - Ponctuations seules (";", ".", ")")
 *   - Lignes avec très peu de contenu alphabétique
 */
const NOISE_LINE = /^([=\-*#~_]{3,}|Page\s+\d+|[hH\d\s]{1,12}|[^\w]{1,3})$/i;

function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;   // blank lines are handled separately
  if (t.length <= 2) return true;     // "H", "h", "2", ";", "—", ") "

  // Filtre les patterns de bruit standard
  if (NOISE_LINE.test(t)) return true;

  // Filtre les lignes avec très peu de lettres alphabétiques (probable artifact)
  // Ex: "23HhHh" a 2 lettres sur 6 chars, "6 7" a 0 lettres sur 3 chars
  const alphaCount = (t.match(/[a-zàâéèêëîïôùûüç]/gi) || []).length;
  const totalNonSpace = t.replace(/\s/g, '').length;
  if (totalNonSpace >= 3 && alphaCount < 2) return true;  // moins de 2 lettres
  if (totalNonSpace >= 4 && alphaCount / totalNonSpace < 0.3) return true;  // < 30% de lettres

  return false;
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
 *   - Supprime les parenthèses vides "Titre ()" → "Titre"
 *   - Supprime une parenthèse ouvrante non fermée "Titre (" → "Titre"
 *   - Supprime les espaces multiples
 */
function normalizeTitle(raw: string): string {
  return raw
    .replace(/\s*:\s*$/, '')
    .replace(/\s*\(\s*\)\s*/g, ' ')  // parenthèses vides : "FRANCE II ()" → "FRANCE II"
    .replace(/\s*\([^)]*$/, '')       // parenthèse ouverte non fermée : "R&D (" → "R&D"
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * True si le titre normalisé est trop court ou vide pour être significatif.
 * Évite de promouvoir des artefacts résiduels.
 */
function isTrivialTitle(title: string): boolean {
  return title.length < 2 || title.replace(/[\W\d]/g, '').length < 2;
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

  // Rejet anticipé : préfixes de type code "F.2.1.", "A.1.2. TITRE"
  // Ces patrons apparaissent dans les PDFs comme étiquettes de paragraphe, pas des titres.
  if (/^[A-Z]\.\d+[.\d]*\s/u.test(trimmed)) return none;

  // 1. Markdown ## Titre
  const mdMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (mdMatch) {
    const level = Math.min(mdMatch[1].length, 3) as 1 | 2 | 3;
    const title = normalizeTitle(mdMatch[2]);
    if (isTrivialTitle(title)) return none;
    return { isHeading: true, title, niveau: level };
  }

  // 2. ALL-CAPS : MATÉRIEL / TOUR DE JEU / LES 5 TOURS
  if (isAllCaps(trimmed) && wordCount(trimmed) <= 9 && trimmed.length >= 3) {
    const niveau: 1 | 2 = wordCount(trimmed) >= 2 ? 1 : 2;
    const title = normalizeTitle(trimmed);
    if (isTrivialTitle(title)) return none;
    return { isHeading: true, title, niveau };
  }

  // 3. "Étape N — ..." pattern
  const etapeMatch = trimmed.match(/^(Étape\s+\d+\s*[—\-]\s*[^:]+?)\s*:?\s*$/i);
  if (etapeMatch) {
    const title = normalizeTitle(etapeMatch[1]);
    if (isTrivialTitle(title)) return none;
    return { isHeading: true, title, niveau: 2 };
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
      !candidate.includes(', ')
    ) {
      const title = normalizeTitle(candidate);
      if (isTrivialTitle(title)) return none;
      return { isHeading: true, title, niveau: 2 };
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
      !/[.!?]$/.test(candidate)
    ) {
      const title = normalizeTitle(candidate);
      if (isTrivialTitle(title)) return none;
      return { isHeading: true, title, niveau: 2 };
    }
  }

  // 6. Titre en casse mixte, ligne précédée d'un blanc
  //    Conditions : 1-8 mots, commence par majuscule, pas article/verbe, pas ponctuation finale
  //    Rejet : ligne contenant ", " (virgule = probablement une phrase)
  if (ctx.prevWasBlank) {
    const wc = wordCount(trimmed);
    if (
      wc >= 1 && wc <= 8 &&
      /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜ]/.test(trimmed) &&
      !isContentStarter(trimmed) &&
      !isVerbStarter(trimmed) &&
      !/[.!?;(]$/.test(trimmed) &&         // '(' final = fragment (R&D ()
      !trimmed.includes(', ')
    ) {
      const title = normalizeTitle(trimmed);
      if (isTrivialTitle(title)) return none;
      // Niveau 3 pour les titres d'un seul mot (sous-sous-section)
      const niveau: 2 | 3 = wc === 1 ? 3 : 2;
      return { isHeading: true, title, niveau };
    }
  }

  // 7. Très court titre isolé (1-3 mots) : permet de capturer des sous-titres même sans blanc
  //    Plus restrictif : doit être très court et significatif
  const wc = wordCount(trimmed);
  if (
    wc >= 1 && wc <= 3 &&
    trimmed.length >= 4 &&              // minimum 4 caractères
    /^[A-ZÀÂÉÈÊËÎÏÔÙÛÜ][a-zàâéèêëîïôùûüç\s]+$/.test(trimmed) &&  // commence par maj, suivi de minuscules
    !isContentStarter(trimmed) &&
    !isVerbStarter(trimmed) &&
    !/[.!?;,:(]$/.test(trimmed)        // pas de ponctuation finale
  ) {
    const title = normalizeTitle(trimmed);
    if (!isTrivialTitle(title)) {
      return { isHeading: true, title, niveau: 3 };
    }
  }

  return none;
}

// ── Titre inline "Titre : Contenu" ───────────────────────────────────────────

/**
 * Détecte les lignes du format « Titre : Contenu » où le titre et le contenu
 * partagent la même ligne (typique des rubriques descriptives de livrets de jeu).
 *
 * Exemples reconnus :
 *   "Monastère (jaune) : Il y a 26 tuiles jaunes différentes…"
 *   "Navire (bleu) : Quand un joueur ajoute une tuile navire…"
 *   "Mine (gris) : Ces tuiles sont les seules sans effet immédiat…"
 *
 * Conditions de reconnaissance :
 *   - Séparateur strict « espace-colon-espace » ` : `
 *   - Titre (partie gauche) : commence par une majuscule, ≤ 6 mots,
 *     pas un article/pronom/verbe introducteur de phrase
 *   - Contenu (partie droite) : ≥ 5 mots (substance suffisante)
 *
 * Retourne null si les conditions ne sont pas remplies.
 */
function splitInlineTitleLine(line: string): { title: string; content: string } | null {
  const sepIdx = line.indexOf(' : ');
  if (sepIdx < 0) return null;

  const titlePart = line.slice(0, sepIdx).trim();
  const contentPart = line.slice(sepIdx + 3).trim();

  if (titlePart.length < 2) return null;
  if (wordCount(titlePart) > 6) return null;
  if (wordCount(contentPart) < 5) return null;

  // Le titre doit commencer par une majuscule
  if (!/^[A-ZÀÂÉÈÊËÎÏÔÙÛÜ]/.test(titlePart)) return null;

  // Rejeter les introducteurs de phrase ordinaires
  if (isContentStarter(titlePart) || isVerbStarter(titlePart)) return null;

  return { title: normalizeTitle(titlePart), content: contentPart };
}

// ── Classification sémantique ─────────────────────────────────────────────────

/**
 * Classifie une section par son titre et optionnellement par le début de son contenu.
 * Le contenu (400 premiers caractères) sert de signal secondaire si le titre est neutre.
 */
export function classifySection(titre: string, contenu = ''): GameSectionType {
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const t = normalize(titre);
  const c = normalize(contenu.slice(0, 400));

  if (
    /presentation|introduction|idee.?du.?jeu|contexte|propos/.test(t) ||
    /^ce jeu |^dans ce jeu|bienvenue|il etait une fois/.test(c)
  ) return 'presentation';

  if (
    /but.?du.?jeu|objectif|remporter|gagner.?partie/.test(t) ||
    /le but est|pour gagner|pour remporter|condition.{0,10}victoire/.test(c)
  ) return 'but_du_jeu';

  if (
    /materiel|composant|contenu.?boite|piece|hex|tuile|plateau/.test(t) ||
    /dans la boite|contient\s*:|\bx\d|\d\s*x\s*(carte|jeton|tuile|pion|cube)/.test(c)
  ) return 'materiel';

  if (
    /mise.?en.?place|preparation|demarrage|avant.?partie|setup/.test(t) ||
    /avant le premier tour|pour commencer|pour preparer|placez le plateau/.test(c)
  ) return 'preparation';

  if (
    /tour.?de.?jeu|deroulement|phase|action|recrut|construir|attaqu|commerc|passer|mecanique/.test(t) ||
    /a son tour|pendant son tour|le joueur actif|chaque joueur (peut|doit)/.test(c)
  ) return 'tour_de_jeu';

  if (/carte.?evenement|evenement/.test(t)) return 'cartes_evenement';

  if (
    /regle.?speciale|exception|cas.?particulier|surpopulation|alliance|territoire.?neutre/.test(t)
  ) return 'regles_speciales';

  if (
    /condition.?victoire|fin.?partie|decompte|score|gagnant|victoire/.test(t) ||
    /la partie se termine|decompte final|calculez les points|comptez les points/.test(c)
  ) return 'victoire';

  if (/variante|mode.?cooper|optionnel|coop/.test(t)) return 'variante';

  if (/conseil|strategi|astuce|recommandation/.test(t)) return 'conseils';

  return 'autre';
}

// ── Découpage principal ───────────────────────────────────────────────────────

/**
 * Découpe le texte brut en sections hiérarchisées.
 *
 * Pipeline en 4 phases :
 *   1. Parsing ligne par ligne → sections brutes
 *   2. Look-ahead : invalide les titres ayant < MIN_LOOKAHEAD_WORDS mots de contenu
 *   3. Merge : fusionne les sections < MERGE_THRESHOLD mots dans la précédente
 *   4. Split : découpe les sections > MAX_SECTION_WORDS par paragraphes (overlap 1 §)
 *
 * @param rawText      - Texte extrait du fichier (PDF ou TXT)
 * @param documentName - Nom du document (titre de la section racine)
 */
export function parseSections(rawText: string, documentName = 'Jeu'): RawSection[] {
  const rawLines = rawText.split(/\r?\n/);

  // ── Phase 1 : Parsing ligne par ligne ────────────────────────────────────────

  const pass1: RawSection[] = [];
  let currentTitle = documentName;
  let currentNiveau: 1 | 2 | 3 = 1;
  let currentContent: string[] = [];
  let prevWasBlank = true;

  let currentPage: number | undefined = undefined;
  let sectionPage: number | undefined = undefined;
  let lastContentPage: number | undefined = undefined;

  const flushSection = () => {
    const content = currentContent.join('\n').trim();
    if (content.length > 0) {
      pass1.push({
        titre: currentTitle,
        contenu: content,
        niveau: currentNiveau,
        page_debut: sectionPage,
        page_fin: lastContentPage,
      });
    }
  };

  for (const rawLine of rawLines) {
    const pageMatch = rawLine.match(/^%%PAGE:(\d+)%%$/);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10);
      if (sectionPage === undefined) sectionPage = currentPage;
      continue;
    }

    if (isNoiseLine(rawLine)) continue;

    const isBlank = rawLine.trim().length === 0;

    // Titre inline « Titre : Contenu » — intercepté avant detectHeading
    if (!isBlank) {
      const inlineSplit = splitInlineTitleLine(rawLine.trim());
      if (inlineSplit) {
        flushSection();
        currentTitle = inlineSplit.title;
        currentNiveau = 2;
        currentContent = [inlineSplit.content];
        sectionPage = currentPage;
        lastContentPage = currentPage;
        prevWasBlank = false;
        continue;
      }
    }

    const { isHeading, title, niveau } = detectHeading(rawLine, { prevWasBlank });

    if (isHeading) {
      flushSection();
      currentTitle = title;
      currentNiveau = niveau;
      currentContent = [];
      sectionPage = currentPage;
      lastContentPage = currentPage;
    } else {
      currentContent.push(rawLine);
      if (!isBlank && currentPage !== undefined) {
        lastContentPage = currentPage;
      }
    }

    prevWasBlank = isBlank;
  }
  flushSection();

  // ── Phase 2 : Look-ahead — invalide les titres sans contenu suffisant ─────────
  // Un titre non confirmé (< MIN_LOOKAHEAD_WORDS mots) est rétrogradé :
  // son titre devient un paragraphe de la section précédente.
  const pass2: RawSection[] = [];
  for (const section of pass1) {
    const wc = wordCount(section.contenu);

    if (wc < MIN_LOOKAHEAD_WORDS && section.titre !== documentName) {
      // Rétrogradation : fusionner avec la section précédente
      if (pass2.length > 0) {
        const prev = pass2[pass2.length - 1];
        prev.contenu = prev.contenu + '\n\n' + section.titre + '\n' + section.contenu;
        prev.page_fin = section.page_fin ?? prev.page_fin;
      } else {
        // Aucune section précédente : promouvoir le titre en contenu
        pass2.push({ ...section, contenu: section.titre + '\n' + section.contenu });
      }
    } else {
      pass2.push({ ...section });
    }
  }

  // ── Phase 3 : Merge — fusionne les sections trop courtes ─────────────────────

  const pass3: RawSection[] = [];
  for (const section of pass2) {
    const wc = wordCount(section.contenu);

    if (wc < MERGE_THRESHOLD && pass3.length > 0) {
      const prev = pass3[pass3.length - 1];
      prev.contenu = prev.contenu + '\n\n' + section.titre + '\n' + section.contenu;
      prev.page_fin = section.page_fin ?? prev.page_fin;
    } else {
      pass3.push({ ...section });
    }
  }

  // ── Phase 4 : Split — découpe les sections trop longues par paragraphes ───────

  const result: RawSection[] = [];

  for (const section of pass3) {
    if (wordCount(section.contenu) <= MAX_SECTION_WORDS) {
      result.push(section);
      continue;
    }

    const paragraphs = section.contenu
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    let chunkParagraphs: string[] = [];
    let chunkWords = 0;
    let chunkIndex = 0;

    const emitChunk = () => {
      if (chunkParagraphs.length === 0) return;
      const titre =
        chunkIndex === 0
          ? section.titre
          : `${section.titre} (suite ${chunkIndex})`;
      result.push({
        titre,
        contenu: chunkParagraphs.join('\n\n'),
        niveau: section.niveau,
        page_debut: section.page_debut,
        page_fin: section.page_fin,
      });
    };

    for (const para of paragraphs) {
      const paraWords = wordCount(para);

      if (chunkWords + paraWords > CHUNK_TARGET_WORDS && chunkParagraphs.length > 0) {
        emitChunk();
        // Overlap : conserver le dernier paragraphe du chunk pour le contexte
        const overlap = chunkParagraphs[chunkParagraphs.length - 1] ?? '';
        chunkParagraphs = overlap ? [overlap] : [];
        chunkWords = wordCount(overlap);
        chunkIndex++;
      }

      chunkParagraphs.push(para);
      chunkWords += paraWords;
    }

    emitChunk();
  }

  // ── Filtre final : écarter les sections inférieures à MIN_SECTION_WORDS ───────
  return result.filter(s => wordCount(s.contenu) >= MIN_SECTION_WORDS);
}
