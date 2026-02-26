/**
 * nlpProcessor.ts — Analyse NLP spécialisée pour le français et les jeux de société
 *
 * Tokenisation : CamemBERT (SentencePiece via @huggingface/transformers v3)
 *   - Tokenizer français entraîné sur CamemBERT (camembert-base)
 *   - Les sous-mots débutant par ▁ marquent le début d'un mot
 *   - Les mots sont reconstruits en concaténant les sous-mots consécutifs
 *
 * Complété par :
 *   - PorterStemmerFr (natural) : stemming pour regrouper les variantes
 *   - Un lexique de jeu de société (GAME_NOUNS)
 *   - La détection de verbes français (infinitifs + impératifs → infinitif lisible)
 *   - Un extracteur de mécaniques de jeu par correspondance de patterns
 *   - Un résumé extractif basé sur les phrases les plus denses
 */

// `natural` is a CommonJS module — use default import to avoid named-export
// interop issues in ESM (`"type": "module"`) environments.
import natural from 'natural';
import type { NlpResult, GameMechanic } from '../types';
import { STOPWORDS_FR, GAME_NOUNS } from '../utils/frenchWords';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PorterStemmerFr } = natural as any;

// ── Tokenizer CamemBERT (lazy, singleton) ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _tokenizer: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTokenizer(): Promise<any> {
  if (_tokenizer) return _tokenizer;

  // @huggingface/transformers v3 : successeur de @xenova/transformers v2.
  // Contrairement à v2, v3 ne dépend pas d'un mock canvas en SSR/Node.js.
  const mod = await import('@huggingface/transformers');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AutoTokenizer = (mod as any).AutoTokenizer ?? (mod as any).default?.AutoTokenizer;

  const cacheDir = process.env['XDG_CACHE_HOME'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (cacheDir) (mod as any).env.cacheDir = cacheDir;

  _tokenizer = await AutoTokenizer.from_pretrained('camembert-base');
  return _tokenizer;
}

/**
 * Tokenise un texte via le tokenizer CamemBERT (SentencePiece).
 * Reconstruit les mots entiers en décodant chaque ID individuellement :
 *   - SentencePiece convertit ▁ en espace → un token décodé commençant par " "
 *     marque le début d'un nouveau mot
 *   - Un token sans espace initial est une continuation du mot courant
 *
 * On n'utilise ni convert_ids_to_tokens ni get_vocab (non exposés en v3).
 */
async function tokenizeToWords(text: string): Promise<string[]> {
  const tokenizer = await getTokenizer();
  const { input_ids } = tokenizer(text);

  // input_ids.data peut être Int32Array ou BigInt64Array selon l'environnement
  const ids: number[] = Array.from(input_ids.data as ArrayLike<number | bigint>).map(Number);

  const words: string[] = [];
  let current = '';

  for (const id of ids) {
    // skip_special_tokens: true → les tokens spéciaux (<s>, </s>…) décodent en ""
    const decoded: string = tokenizer.decode([id], {
      skip_special_tokens: true,
      clean_up_tokenization_spaces: false,
    });

    if (!decoded) {
      // Token spécial : ferme le mot en cours
      if (current) {
        words.push(current);
        current = '';
      }
      continue;
    }

    if (decoded.startsWith(' ')) {
      // ▁ → espace : début d'un nouveau mot
      if (current) words.push(current);
      current = decoded.slice(1); // supprime l'espace initial
    } else {
      // Sous-mot de continuation
      current += decoded;
    }
  }
  if (current) words.push(current);

  return words.filter((w) => w.length > 0);
}

// ── Détection de verbes français ─────────────────────────────────────────────

/**
 * Convertit un impératif 2e personne pluriel (-ez) en infinitif approximatif.
 * Exemples : "placez" → "placer", "choisissez" → "choisir", "prenez" → "prendre"
 */
function imperativeToInfinitive(word: string): string {
  const w = word.toLowerCase();
  if (!w.endsWith('ez') || w.length < 5) return w;

  const stem = w.slice(0, -2);

  // Verbes en -issez (finir, choisir…) → conserver comme -ir (choisir)
  if (stem.endsWith('iss')) return `${stem.slice(0, -3)}ir`;
  // Verbes en -aissez (connaître…) → -aître
  if (stem.endsWith('aiss')) return `${stem.slice(0, -4)}aître`;
  // Verbes type "prenez" → "prendre", "vendez" → "vendre"
  if (/[dt]$/.test(stem)) return `${stem}re`;
  // Cas général : stem + "er" (placer, jouer, avancer…)
  return `${stem}er`;
}

/**
 * Détermine si un mot est (ou ressemble à) un infinitif français.
 */
function isInfinitive(word: string): boolean {
  if (word.length < 4) return false;
  return /(?:er|ir|oir|re)$/i.test(word);
}

/**
 * Extrait les verbes d'action depuis un texte en français.
 * Utilise le tokenizer CamemBERT puis normalise les impératifs en infinitifs lisibles.
 */
async function extractFrenchActions(text: string): Promise<string[]> {
  const tokens: string[] = await tokenizeToWords(text.toLowerCase());
  const verbs = new Set<string>();

  for (const token of tokens) {
    if (token.length <= 3 || STOPWORDS_FR.has(token)) continue;

    // Impératif pluriel → infinitif lisible ("placez" → "placer")
    if (token.endsWith('ez') && token.length >= 5) {
      verbs.add(imperativeToInfinitive(token));
      continue;
    }

    // Infinitif direct ("placer", "jouer", "attaquer"…)
    if (isInfinitive(token)) {
      verbs.add(token);
    }
  }

  return [...verbs].sort();
}

// ── Extraction d'entités ──────────────────────────────────────────────────────

/**
 * Extrait les entités du texte :
 *   1. Noms du lexique jeu (GAME_NOUNS) — via PorterStemmerFr pour les variantes
 *   2. Mots capitalisés non-début-de-phrase (noms propres de jeu)
 *   3. Noms communs apparaissant ≥ 2 fois (concepts-clés)
 */
async function extractFrenchEntities(text: string): Promise<string[]> {
  const entities = new Set<string>();

  // 1. Scan du lexique de jeu (terme exact OU même stem)
  const lower = text.toLowerCase();
  for (const noun of GAME_NOUNS) {
    if (lower.includes(noun)) entities.add(noun);
  }

  // 2. Mots capitalisés en milieu de phrase (noms propres, noms de jeu)
  const properNounRegex = /(?<=[,;:.!?\s])([A-ZÀÂÉÈÊËÎÏÔÙÛÜ][a-zàâéèêëîïôùûü]{2,})/g;
  for (const match of text.matchAll(properNounRegex)) {
    const word = match[1].toLowerCase();
    if (!STOPWORDS_FR.has(word) && word.length > 3) {
      entities.add(word);
    }
  }

  // 3. Mots fréquents (≥ 2 occurrences) via tokenizer CamemBERT
  const tokens: string[] = await tokenizeToWords(lower);
  const freq: Record<string, number> = {};
  for (const w of tokens) {
    if (w.length > 3 && !STOPWORDS_FR.has(w) && !isInfinitive(w)) {
      // Utilise le stem pour regrouper les variantes, retourne la forme originale
      const stem = PorterStemmerFr.stem(w);
      freq[stem] = (freq[stem] ?? 0) + 1;
      if ((freq[stem] ?? 0) >= 2) entities.add(w);
    }
  }

  return [...entities].sort();
}

// ── Détection de mécaniques de jeu ───────────────────────────────────────────

/** Patterns textuels → mécaniques de jeu de société */
const MECHANIC_PATTERNS: Array<{ pattern: RegExp; mechanic: GameMechanic }> = [
  // ── Placement ────────────────────────────────────────────────────────────────
  // Poser un composant sur le plateau, installer une structure, déployer
  {
    pattern:
      /pla[cç]er?|pos(?:er|itionner)|d[eé]poser|install(?:er|ez)|arrimer|[eé]riger|d[eé]ploy(?:er|ez)|installer|empiler|mettre sur le plateau|placer sur/i,
    mechanic: 'placement',
  },

  // ── Pioche ───────────────────────────────────────────────────────────────────
  // Tirer une carte ou un composant depuis un paquet, un sac, etc.
  {
    pattern:
      /pioch(?:er|ez|e\b)|tir(?:er|ez) (?:une? (?:carte?|tuile|jeton)|du deck|dans le sac)|piger|prendre dans la pioche|distribu(?:er|ez)|m(?:e|i)ttre en main|piochez|tire[rz] du sac|tirer au sort|tir[eé] au hasard/i,
    mechanic: 'pioche',
  },

  // ── Gestion des ressources ────────────────────────────────────────────────────
  // Collecter, stocker, dépenser des ressources
  {
    pattern:
      /ressource[s]?|collect(?:er|ez)|produi(?:t|re|sez)|stock(?:er|ez)|accumul(?:er|ez)|d[eé]pens(?:er|ez)|pay(?:er|ez)|r[eé]colt(?:er|ez)|r[eé]colte\b|production\b|entrepôt|approvisionn(?:er|ez)|r[eé]servoir|g[eé]rer? (?:les |ses )?ressources/i,
    mechanic: 'gestion_ressources',
  },

  // ── Combat aux dés ────────────────────────────────────────────────────────────
  // Résolution de combats par jet de dé, symboles de combat
  {
    pattern:
      /d[eé]s? de combat|lanc(?:er|ez) (?:le|les|un|des) d[eé][s]?|jet de d[eé]|r[eé]sultat du d[eé]|face [ée]p[eé]e|symbole (?:de |d')[eé]p[eé]e|r[eé]soudre (?:le |un )?combat|lancer les d[eé]s|valeur du d[eé]|r[eé]sultat du lancer|relancer (?:le|les|un|des) d[eé][s]?|opposer (?:les |ses )?d[eé]s/i,
    mechanic: 'combat_des',
  },

  // ── Contrôle de territoire ────────────────────────────────────────────────────
  // Conquérir, défendre, occuper des zones
  {
    pattern:
      /terr?itoire[s]?|contrôl(?:er|ez)|occup(?:er|ez)|conqu[eé]r(?:ir|ez)|annexer|envahir|d[eé]fendre|reconqu[eé]r(?:ir|ez)|capturer (?:une?|le|la|les) (?:zone|r[eé]gion|hexagone|territoire)|zone contrôl[eé]e|majorit[eé] sur|pr[eé]sence militaire|tenir (?:le|la|les|un)/i,
    mechanic: 'controle_territoire',
  },

  // ── Commerce ─────────────────────────────────────────────────────────────────
  // Acheter, vendre, échanger avec d'autres joueurs ou le jeu
  {
    pattern:
      /commerc(?:er|ez)|[eé]chang(?:er|ez)|march[eé][s]?|vendre|acheter|troquer|n[eé]goci(?:er|ez)|offrir|recevoir en [eé]change|boutique|magasin|transaction|prix d[eu] (?:vente|marché)|acquérir|payer (?:un |le |des )?prix/i,
    mechanic: 'commerce',
  },

  // ── Draft de cartes ───────────────────────────────────────────────────────────
  // Sélectionner parmi plusieurs options, passer des cartes, rivière
  {
    pattern:
      /rivi[eè]re|draft\b|choisir (?:une?|parmi|dans)|s[eé]lectionner|passer (?:les cartes?|sa main)|choisissez (?:une? |parmi )|s[eé]lection simultan[eé]e|simultané(?:ment)?|r[eé]v[eé]ler (?:en m[eê]me temps|simultan[eé]ment)|prendre l[ae]? meilleure|d[eé]fausser une? (?:carte?|tuile)/i,
    mechanic: 'draft_cartes',
  },

  // ── Points de victoire ────────────────────────────────────────────────────────
  // Compter les points, conditions de fin de partie
  {
    pattern:
      /point[s]? de victoire|vp\b|score[s]?|marquer (?:des )?points?|comptabilis(?:er|ez)|d[eé]compte final|total de points?|fin de partie|gagner la partie|remporter la victoire|calcul(?:er|ez) (?:les )?points?|majorit[eé] (?:des )?points?/i,
    mechanic: 'points_victoire',
  },

  // ── Coopération ──────────────────────────────────────────────────────────────
  // Jouer ensemble, victoire collective
  {
    pattern:
      /coop[eé]r(?:er|atif|ation)|ensemble\b|alli[eé][s]? gagnent|mode coop(?:[eé]ratif)?|victoire collective|[eé]quipe\b|jouer ensemble|gagner ensemble|perdre ensemble|objectif commun|co[- ]op|tous les joueurs? (?:gagnent|perdent|doivent)/i,
    mechanic: 'cooperation',
  },

  // ── Événements ───────────────────────────────────────────────────────────────
  // Cartes événement, effets déclenchés, crises
  {
    pattern:
      /carte [eé]v[eé]nement|[eé]v[eé]nement[s]?\b|catastroph|crise\b|d[eé]clench(?:er|ez)|r[eé]v[eé]ler (?:une? )?carte|effet imm[eé]diat|appliquer (?:l[ea]? )?[eé]v[eé]nement|phase d[eu] (?:crise|[eé]v[eé]nement)|carte agenda|scripted event/i,
    mechanic: 'events',
  },

  // ── Enchères ──────────────────────────────────────────────────────────────────
  // Miser, offrir, remporter aux enchères
  {
    pattern:
      /ench[eè]re[s]?|ench[eé]rir|mise\b|miser|offre\b|offrir (?:une? )?mise|remporter (?:aux )?ench[eè]res?|vente aux ench[eè]res?|lot (?:mis aux|aux )?ench[eè]res?|surench[eé]rir|meilleur offrant|soumission|ajout(?:er)? (?:une? )?mise|passer (?:son )?tour (?:aux )?ench[eè]res?/i,
    mechanic: 'encheres',
  },

  // ── Construction / moteur ─────────────────────────────────────────────────────
  // Bâtir des structures, améliorer son moteur d'actions
  {
    pattern:
      /construire|bâtir|[eé]riger|construis(?:ez|ons)?|bâtissez|construire (?:une?|le|la)|améliorer? (?:sa|son|une?|le|la)|am[eé]lioration|upgrade\b|moteur\b|engine building|tableau de jeu|fiche de joueur|d[eé]velopp(?:er|ez)|expansion\b|agrandir|niveau (?:sup[eé]rieur|suivant)/i,
    mechanic: 'construction',
  },

  // ── Déduction ─────────────────────────────────────────────────────────────────
  // Trouver, éliminer, déduire par indices
  {
    pattern:
      /d[eé]dui(?:re|sez)|indice[s]?|accusation|[eé]liminer (?:un|le|la) (?:suspect|coupable|personnage)|enquête|enqu[eé]t(?:er|ez)|r[oô]le cach[eé]|identit[eé] secr[eè]te|trouver (?:le|la|les) (?:coupable|meurtrier|traître)|bluff(?:er|ez)?|mentir\b|informations? secr[eè]tes?/i,
    mechanic: 'deduction',
  },

  // ── Mouvement ─────────────────────────────────────────────────────────────────
  // Déplacer des pions, naviguer sur le plateau
  {
    pattern:
      /se d[eé]placer|d[eé]plac(?:er|ez)|avancer?|reculer?|navigu(?:er|ez)|traverser?|cheminer?|mouvement[s]?\b|d[eé]placement[s]?\b|d'une case [àa] (?:l'autre|une autre)|nombre de cases?|chemin le plus court|bloquer (?:le )?passage|d[eé]placement de (?:pion|figurine|personnage)/i,
    mechanic: 'mouvement',
  },

  // ── Gestion de main ───────────────────────────────────────────────────────────
  // Jouer des cartes depuis sa main, gérer la taille de main
  {
    pattern:
      /jouer (?:une? )?carte|d[eé]fausser (?:une? )?carte|garder (?:en |sa )?main|main pleine|limite de main|taille de (?:la )?main|nombre de cartes? en main|r[eé]cup[eé]rer? (?:sa|sa|une?) main|piocher (?:jusqu)[àa]|remplir sa main|cartes? en main/i,
    mechanic: 'gestion_main',
  },

  // ── Programmation / action simultanée ─────────────────────────────────────────
  // Planifier ses actions à l'avance, révélation simultanée
  {
    pattern:
      /planifier?|programm(?:er|ez)|ordre d[eu] (?:tour|jeu|r[eé]solution)|s[eé]quence d[eu] (?:tour|jeu)|simultan[eé](?:ment)?|r[eé]v[eé]l(?:er|ez) (?:en m[eê]me temps|simultan[eé]ment)|choisir (?:son|ses) action[s]? (?:avant|en secret|simultan[eé]ment)|action planifi[eé]e|ordre secret/i,
    mechanic: 'programmation',
  },

  // ── Rôle secret ───────────────────────────────────────────────────────────────
  // Identité cachée, traître, équipes secrètes
  {
    pattern:
      /r[oô]le (?:secret|cach[eé])|traître\b|identit[eé] (?:secr[eè]te|cach[eé]e)|mission (?:secr[eè]te|cach[eé]e)|[eé]quipe secr[eè]te|camp secret|r[eé]v[eé]ler son r[oô]le|cacher son r[oô]le|en secret|objectif (?:secret|cach[eé])|fid[eé]lit[eé] cach[eé]e|carte de r[oô]le/i,
    mechanic: 'role_secret',
  },
];

/**
 * Détecte les mécaniques de jeu présentes dans un bloc de texte.
 */
export function detectMechanics(text: string): GameMechanic[] {
  const found = new Set<GameMechanic>();
  for (const { pattern, mechanic } of MECHANIC_PATTERNS) {
    if (pattern.test(text)) found.add(mechanic);
  }
  return [...found];
}

// ── Résumé extractif ──────────────────────────────────────────────────────────

/**
 * Retourne les 2 premières phrases françaises contenant ≥ 8 mots.
 */
function extractSummary(text: string, maxSentences = 2): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 8);
  return sentences.slice(0, maxSentences).join(' ');
}

// ── Export principal ──────────────────────────────────────────────────────────

/**
 * Analyse NLP complète d'une section de règles en français.
 */
export async function analyzeText(text: string): Promise<NlpResult> {
  if (!text || text.trim().length === 0) {
    return { entites: [], actions: [], resume: '' };
  }

  return {
    entites: await extractFrenchEntities(text),
    actions: await extractFrenchActions(text),
    resume: extractSummary(text),
  };
}
