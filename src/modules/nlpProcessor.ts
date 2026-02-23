/**
 * nlpProcessor.ts — Analyse NLP spécialisée pour le français et les jeux de société
 *
 * Utilise la librairie `natural` pour le français :
 *   - AggressiveTokenizerFr : tokenisation adaptée au français
 *   - PorterStemmerFr       : stemming (racines communes pour les variantes d'un mot)
 *
 * Complété par :
 *   - Un lexique de jeu de société (GAME_NOUNS)
 *   - La détection de verbes français (infinitifs + impératifs → infinitif lisible)
 *   - Un extracteur de mécaniques de jeu par correspondance de patterns
 *   - Un résumé extractif basé sur les phrases les plus denses
 */

// `natural` is a CommonJS module — use default import to avoid named-export
// interop issues in ESM (`"type": "module"`) environments.
import natural from 'natural';
import type { NlpResult, GameMechanic } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { AggressiveTokenizerFr, PorterStemmerFr } = natural as any;

const tokenizerFr = new AggressiveTokenizerFr();

// ── Stopwords français ────────────────────────────────────────────────────────

const STOPWORDS_FR = new Set([
  // ── Articles ────────────────────────────────────────────────────────────────
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd',

  // ── Pronoms personnels ───────────────────────────────────────────────────────
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'me', 'te', 'se', 'lui', 'y', 'en',
  'moi', 'toi', 'soi',

  // ── Pronoms démonstratifs ────────────────────────────────────────────────────
  'ce', 'cet', 'cette', 'ces',
  'celui', 'celle', 'ceux', 'celles',
  'cela', 'ça', 'ceci',

  // ── Déterminants possessifs ──────────────────────────────────────────────────
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
  'son', 'sa', 'ses', 'notre', 'votre', 'vos', 'nos', 'leur', 'leurs',

  // ── Prépositions ────────────────────────────────────────────────────────────
  'à', 'au', 'aux', 'de', 'du', 'des',
  'par', 'pour', 'sur', 'sous', 'dans', 'avec', 'sans', 'entre',
  'vers', 'chez', 'contre', 'malgré', 'derrière', 'devant', 'autour',
  'parmi', 'sauf', 'hors', 'depuis', 'jusqu', 'jusque', 'environ',
  'dès', 'selon', 'afin', 'lors',

  // ── Conjonctions de coordination ────────────────────────────────────────────
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car',

  // ── Conjonctions de subordination ───────────────────────────────────────────
  'que', 'qu', 'qui', 'si', 'comme', 'quand', 'lorsque', 'puisque',
  'quoique', 'tandis', 'parce', 'car', 'cependant', 'néanmoins',
  'toutefois', 'pourtant', 'quoique', 'bien',

  // ── Adverbes courants ────────────────────────────────────────────────────────
  'ne', 'pas', 'plus', 'non', 'oui', 'jamais', 'toujours', 'souvent',
  'parfois', 'rarement', 'encore', 'déjà', 'trop', 'assez', 'peu',
  'beaucoup', 'tellement', 'très', 'aussi', 'alors', 'ainsi', 'donc',
  'moins', 'bien', 'déjà', 'seulement', 'notamment', 'environ',

  // ── Indéfinis ────────────────────────────────────────────────────────────────
  'tout', 'tous', 'toute', 'toutes',
  'chaque', 'chacun', 'chacune',
  'aucun', 'aucune', 'nul', 'nulle',
  'autre', 'autres', 'même', 'mêmes',
  'certain', 'certaine', 'certains', 'certaines',
  'quelque', 'quelques', 'plusieurs', 'divers', 'diverses',

  // ── Pronoms relatifs ─────────────────────────────────────────────────────────
  'dont', 'où', 'lequel', 'laquelle', 'lesquels', 'lesquelles',
  'auquel', 'duquel', 'desquels', 'auxquels',

  // ── Pronoms interrogatifs ────────────────────────────────────────────────────
  'comment', 'pourquoi', 'quoi', 'quel', 'quelle', 'quels', 'quelles',
  'combien',

  // ── Auxiliaire être — toutes conjugaisons ────────────────────────────────────
  'être', 'été', 'étant',
  'suis', 'es', 'est', 'sommes', 'êtes', 'sont',
  'étais', 'était', 'étions', 'étiez', 'étaient',
  'serai', 'seras', 'sera', 'serons', 'serez', 'seront',
  'serais', 'serait', 'serions', 'seriez', 'seraient',
  'fus', 'fut', 'fûmes', 'fûtes', 'furent',
  'soit', 'soient', 'soyons', 'soyez',

  // ── Auxiliaire avoir — toutes conjugaisons ───────────────────────────────────
  'avoir', 'eu', 'ayant',
  'ai', 'as', 'avons', 'avez', 'ont',
  'avais', 'avait', 'avions', 'aviez', 'avaient',
  'aurai', 'auras', 'aura', 'aurons', 'aurez', 'auront',
  'aurais', 'aurait', 'aurions', 'auriez', 'auraient',
  'eus', 'eut', 'eûmes', 'eûtes', 'eurent',
  'ait', 'aient', 'ayons', 'ayez',

  // ── Verbe faire ──────────────────────────────────────────────────────────────
  'faire', 'fait', 'faite', 'faits', 'faites', 'faisant',
  'fais', 'faisons', 'font',
  'faisais', 'faisait', 'faisions', 'faisiez', 'faisaient',
  'ferai', 'feras', 'fera', 'ferons', 'ferez', 'feront',
  'ferais', 'ferait', 'ferions', 'feriez', 'feraient',
  'fis', 'fit', 'fîmes', 'fîtes', 'firent',
  'fasse', 'fassent', 'fassions', 'fassiez',

  // ── Verbe aller ──────────────────────────────────────────────────────────────
  'aller', 'allé', 'allant',
  'vais', 'vas', 'va', 'allons', 'allez', 'vont',
  'allais', 'allait', 'allions', 'alliez', 'allaient',
  'irai', 'iras', 'ira', 'irons', 'irez', 'iront',
  'irais', 'irait', 'irions', 'iriez', 'iraient',

  // ── Verbe pouvoir ─────────────────────────────────────────────────────────────
  'pouvoir', 'pu', 'pouvant',
  'peux', 'peut', 'pouvons', 'pouvez', 'peuvent',
  'pouvais', 'pouvait', 'pouvions', 'pouviez', 'pouvaient',
  'pourrai', 'pourras', 'pourra', 'pourrons', 'pourrez', 'pourront',
  'pourrais', 'pourrait', 'pourrions', 'pourriez', 'pourraient',
  'puisse', 'puissent', 'puissions', 'puissiez',

  // ── Verbe devoir ─────────────────────────────────────────────────────────────
  'devoir', 'dû', 'devant',
  'dois', 'doit', 'devons', 'devez', 'doivent',
  'devais', 'devait', 'devions', 'deviez', 'devaient',
  'devrai', 'devras', 'devra', 'devrons', 'devrez', 'devront',
  'devrais', 'devrait', 'devrions', 'devriez', 'devraient',
  'doive', 'doivent', 'devions', 'deviez',

  // ── Verbe vouloir ─────────────────────────────────────────────────────────────
  'vouloir', 'voulu', 'voulant',
  'veux', 'veut', 'voulons', 'voulez', 'veulent',
  'voulais', 'voulait', 'voulions', 'vouliez', 'voulaient',
  'voudrai', 'voudras', 'voudra', 'voudrons', 'voudrez', 'voudront',
  'voudrais', 'voudrait', 'voudrions', 'voudriez', 'voudraient',
  'veuille', 'veuillent', 'voulions', 'vouliez',

  // ── Verbe savoir ─────────────────────────────────────────────────────────────
  'savoir', 'su', 'sachant',
  'sais', 'sait', 'savons', 'savez', 'savent',
  'savais', 'savait', 'savions', 'saviez', 'savaient',
  'saurai', 'sauras', 'saura', 'saurons', 'saurez', 'sauront',
  'saurais', 'saurait', 'saurions', 'sauriez', 'sauraient',
  'sache', 'sachent', 'sachons', 'sachez',

  // ── Autres verbes courants ────────────────────────────────────────────────────
  'dit', 'dire', 'disant', 'disent', 'dites', 'disait', 'dirait',
  'vient', 'venir', 'venu', 'venant', 'venez', 'venons', 'viennent',
  'prend', 'prendre', 'pris', 'prenant', 'prenez', 'prenons', 'prennent',
  'met', 'mettre', 'mis', 'mettant', 'mettez', 'mettons', 'mettent',

  // ── Locutions et mots-outils ─────────────────────────────────────────────────
  'voici', 'voilà', 'soit', 'sinon', 'lors', 'dès', 'après', 'avant',
  'pendant', 'selon', 'afin', 'n', 'c', 'j', 'm', 't', 's',
  'etc', 'notamment',
]);

// ── Lexique de jeu de société (entités) ──────────────────────────────────────

/**
 * Noms caractéristiques du domaine "jeu de société".
 * Détectés même s'ils n'apparaissent qu'une seule fois.
 */
const GAME_NOUNS = new Set([
  // ── Composants physiques génériques ──────────────────────────────────────────
  'plateau', 'plateaux', 'tuile', 'tuiles', 'carte', 'cartes',
  'dé', 'dés', 'pion', 'pions', 'jeton', 'jetons',
  'marqueur', 'marqueurs', 'cube', 'cubes', 'token', 'tokens',
  'meeple', 'meeples', 'figurine', 'figurines', 'disque', 'disques',
  'cylindre', 'cylindres', 'prisme', 'prismes', 'bâton', 'bâtons',
  'fiche', 'fiches', 'plateau-joueur', 'tuile-joueur', 'écran', 'écrans',

  // ── Cartes — types et zones ───────────────────────────────────────────────────
  'deck', 'decks', 'pioche', 'pioches', 'défausse', 'défausses',
  'main', 'rivière', 'paquet', 'paquets', 'réserve', 'archive',
  'bibliothèque', 'boutique', 'magasin', 'marché', 'marchés', 'sac',
  'bourse', 'pile', 'piles',

  // ── Faces de dé / symboles ────────────────────────────────────────────────────
  'face', 'faces', 'symbole', 'symboles', 'résultat', 'résultats',
  'valeur', 'valeurs', 'relancer', 'relance',

  // ── Pions, figurines, personnages ─────────────────────────────────────────────
  'personnage', 'personnages', 'héros', 'héroïne', 'héroïnes',
  'guerrier', 'guerriers', 'soldat', 'soldats', 'chevalier', 'chevaliers',
  'archer', 'archers', 'explorateur', 'explorateurs',
  'colon', 'colons', 'habitant', 'habitants', 'ouvrier', 'ouvriers',
  'chef', 'chefs', 'leader', 'leaders', 'roi', 'reine', 'reines',
  'seigneur', 'seigneurs', 'capitaine', 'capitaines',
  'mercenaire', 'mercenaires', 'sbire', 'sbires', 'garde', 'gardes',

  // ── Bâtiments et structures ───────────────────────────────────────────────────
  'bâtiment', 'bâtiments', 'construction', 'constructions',
  'ville', 'villes', 'village', 'villages', 'colonie', 'colonies',
  'cité', 'cités', 'forteresse', 'forteresses', 'château', 'châteaux',
  'citadelle', 'citadelles', 'tour', 'tours', 'temple', 'temples',
  'mine', 'mines', 'ferme', 'fermes', 'port', 'ports',
  'route', 'routes', 'chemin', 'chemins', 'entrepôt', 'entrepôts',
  'caserne', 'casernes', 'académie', 'académies', 'autel', 'autels',
  'bibliothèque', 'rempart', 'remparts', 'muraille', 'murailles',

  // ── Ressources ────────────────────────────────────────────────────────────────
  'ressource', 'ressources', 'bois', 'pierre', 'or', 'argent',
  'eau', 'nourriture', 'magie', 'énergie', 'foi', 'science',
  'culture', 'influence', 'grain', 'blé', 'fer', 'charbon',
  'pétrole', 'gemme', 'gemmes', 'cristal', 'cristaux',
  'mana', 'essence', 'monnaie', 'monnaies', 'pièce', 'pièces',
  'uranium', 'carbone', 'plastique', 'verre', 'tissu', 'cuir',
  'métal', 'métaux', 'potion', 'potions', 'carte-ressource', 'carte-ressources',

  // ── Zones et lieux ────────────────────────────────────────────────────────────
  'territoire', 'territoires', 'région', 'régions', 'zone', 'zones',
  'hexagone', 'hexagones', 'case', 'cases', 'espace', 'espaces',
  'île', 'îles', 'continent', 'continents', 'domaine', 'domaines',
  'contrée', 'contrées', 'plaine', 'plaines', 'forêt', 'forêts',
  'montagne', 'montagnes', 'désert', 'déserts', 'mer', 'mers',
  'rivière', 'fleuves', 'côte', 'côtes', 'frontière', 'frontières',
  'case', 'emplacement', 'emplacements', 'slot', 'slots',

  // ── Acteurs ───────────────────────────────────────────────────────────────────
  'joueur', 'joueurs', 'adversaire', 'adversaires',
  'allié', 'alliés', 'partenaire', 'partenaires',
  'ennemi', 'ennemis', 'gardien', 'gardiens',
  'ombre', 'ombres', 'créature', 'créatures',
  'monstre', 'monstres', 'boss', 'bête', 'bêtes',

  // ── Structure de tour ─────────────────────────────────────────────────────────
  'manche', 'manches', 'tour', 'round', 'rounds',
  'phase', 'phases', 'étape', 'étapes', 'début', 'fin',
  'activation', 'activations', 'résolution', 'révélation',
  'préparation', 'nettoyage', 'entretien',

  // ── Victoire et score ─────────────────────────────────────────────────────────
  'point', 'points', 'victoire', 'défaite', 'score', 'scores',
  'objectif', 'objectifs', 'mission', 'missions',
  'condition', 'conditions', 'quête', 'quêtes', 'but', 'buts',
  'récompense', 'récompenses', 'trophée', 'trophées', 'couronne',
  'rang', 'classement', 'vainqueur', 'vainqueurs',

  // ── Mécaniques ────────────────────────────────────────────────────────────────
  'action', 'actions', 'combat', 'attaque', 'attaques',
  'défense', 'défenses', 'alliance', 'alliances',
  'pioche', 'draft', 'enchère', 'enchères', 'vote', 'votes',
  'commerce', 'échange', 'échanges', 'tractation', 'tractations',
  'production', 'productions', 'collecte', 'récolte', 'récoltes',
  'mouvement', 'mouvements', 'déplacement', 'déplacements',
  'placement', 'recrutement', 'sélection', 'activation',

  // ── Effets et capacités ───────────────────────────────────────────────────────
  'effet', 'effets', 'capacité', 'capacités', 'pouvoir', 'pouvoirs',
  'compétence', 'compétences', 'sort', 'sorts', 'maléfice', 'maléfices',
  'bénédiction', 'bénédictions', 'malédiction', 'malédictions',
  'état', 'états', 'statut', 'blessure', 'blessures',
  'buff', 'debuff', 'modificateur', 'modificateurs',

  // ── Économie et coûts ─────────────────────────────────────────────────────────
  'coût', 'coûts', 'bonus', 'malus', 'pénalité', 'pénalités',
  'prix', 'tarif', 'limite', 'limites', 'maximum', 'minimum',
  'seuil', 'seuils', 'stock', 'stocks',

  // ── Règles et exceptions ──────────────────────────────────────────────────────
  'règle', 'règles', 'exception', 'exceptions', 'contrainte', 'contraintes',
  'restriction', 'restrictions', 'condition', 'conditions', 'événement', 'événements',
  'déclencheur', 'déclencheurs', 'effet', 'timing', 'priorité',

  // ── Stratégie ────────────────────────────────────────────────────────────────
  'stratégie', 'stratégies', 'tactique', 'tactiques',
  'manœuvre', 'manœuvres', 'combo', 'combos', 'synergies', 'synergie',
]);

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
  if (stem.endsWith('iss')) return stem.slice(0, -3) + 'ir';
  // Verbes en -aissez (connaître…) → -aître
  if (stem.endsWith('aiss')) return stem.slice(0, -4) + 'aître';
  // Verbes type "prenez" → "prendre", "vendez" → "vendre"
  if (/[dt]$/.test(stem)) return stem + 're';
  // Cas général : stem + "er" (placer, jouer, avancer…)
  return stem + 'er';
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
 * Utilise AggressiveTokenizerFr puis normalise les impératifs en infinitifs lisibles.
 */
function extractFrenchActions(text: string): string[] {
  const tokens: string[] = tokenizerFr.tokenize(text.toLowerCase()) ?? [];
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
function extractFrenchEntities(text: string): string[] {
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

  // 3. Mots fréquents (≥ 2 occurrences) via AggressiveTokenizerFr
  const tokens: string[] = tokenizerFr.tokenize(lower) ?? [];
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
    pattern: /pla[cç]er?|pos(?:er|itionner)|d[eé]poser|install(?:er|ez)|arrimer|[eé]riger|d[eé]ploy(?:er|ez)|installer|empiler|mettre sur le plateau|placer sur/i,
    mechanic: 'placement',
  },

  // ── Pioche ───────────────────────────────────────────────────────────────────
  // Tirer une carte ou un composant depuis un paquet, un sac, etc.
  {
    pattern: /pioch(?:er|ez|e\b)|tir(?:er|ez) (?:une? (?:carte?|tuile|jeton)|du deck|dans le sac)|piger|prendre dans la pioche|distribu(?:er|ez)|m(?:e|i)ttre en main|piochez|tire[rz] du sac|tirer au sort|tir[eé] au hasard/i,
    mechanic: 'pioche',
  },

  // ── Gestion des ressources ────────────────────────────────────────────────────
  // Collecter, stocker, dépenser des ressources
  {
    pattern: /ressource[s]?|collect(?:er|ez)|produi(?:t|re|sez)|stock(?:er|ez)|accumul(?:er|ez)|d[eé]pens(?:er|ez)|pay(?:er|ez)|r[eé]colt(?:er|ez)|r[eé]colte\b|production\b|entrepôt|approvisionn(?:er|ez)|r[eé]servoir|g[eé]rer? (?:les |ses )?ressources/i,
    mechanic: 'gestion_ressources',
  },

  // ── Combat aux dés ────────────────────────────────────────────────────────────
  // Résolution de combats par jet de dé, symboles de combat
  {
    pattern: /d[eé]s? de combat|lanc(?:er|ez) (?:le|les|un|des) d[eé][s]?|jet de d[eé]|r[eé]sultat du d[eé]|face [ée]p[eé]e|symbole (?:de |d')[eé]p[eé]e|r[eé]soudre (?:le |un )?combat|lancer les d[eé]s|valeur du d[eé]|r[eé]sultat du lancer|relancer (?:le|les|un|des) d[eé][s]?|opposer (?:les |ses )?d[eé]s/i,
    mechanic: 'combat_des',
  },

  // ── Contrôle de territoire ────────────────────────────────────────────────────
  // Conquérir, défendre, occuper des zones
  {
    pattern: /terr?itoire[s]?|contrôl(?:er|ez)|occup(?:er|ez)|conqu[eé]r(?:ir|ez)|annexer|envahir|d[eé]fendre|reconqu[eé]r(?:ir|ez)|capturer (?:une?|le|la|les) (?:zone|r[eé]gion|hexagone|territoire)|zone contrôl[eé]e|majorit[eé] sur|pr[eé]sence militaire|tenir (?:le|la|les|un)/i,
    mechanic: 'controle_territoire',
  },

  // ── Commerce ─────────────────────────────────────────────────────────────────
  // Acheter, vendre, échanger avec d'autres joueurs ou le jeu
  {
    pattern: /commerc(?:er|ez)|[eé]chang(?:er|ez)|march[eé][s]?|vendre|acheter|troquer|n[eé]goci(?:er|ez)|offrir|recevoir en [eé]change|boutique|magasin|transaction|prix d[eu] (?:vente|marché)|acquérir|payer (?:un |le |des )?prix/i,
    mechanic: 'commerce',
  },

  // ── Draft de cartes ───────────────────────────────────────────────────────────
  // Sélectionner parmi plusieurs options, passer des cartes, rivière
  {
    pattern: /rivi[eè]re|draft\b|choisir (?:une?|parmi|dans)|s[eé]lectionner|passer (?:les cartes?|sa main)|choisissez (?:une? |parmi )|s[eé]lection simultan[eé]e|simultané(?:ment)?|r[eé]v[eé]ler (?:en m[eê]me temps|simultan[eé]ment)|prendre l[ae]? meilleure|d[eé]fausser une? (?:carte?|tuile)/i,
    mechanic: 'draft_cartes',
  },

  // ── Points de victoire ────────────────────────────────────────────────────────
  // Compter les points, conditions de fin de partie
  {
    pattern: /point[s]? de victoire|vp\b|score[s]?|marquer (?:des )?points?|comptabilis(?:er|ez)|d[eé]compte final|total de points?|fin de partie|gagner la partie|remporter la victoire|calcul(?:er|ez) (?:les )?points?|majorit[eé] (?:des )?points?/i,
    mechanic: 'points_victoire',
  },

  // ── Coopération ──────────────────────────────────────────────────────────────
  // Jouer ensemble, victoire collective
  {
    pattern: /coop[eé]r(?:er|atif|ation)|ensemble\b|alli[eé][s]? gagnent|mode coop(?:[eé]ratif)?|victoire collective|[eé]quipe\b|jouer ensemble|gagner ensemble|perdre ensemble|objectif commun|co[- ]op|tous les joueurs? (?:gagnent|perdent|doivent)/i,
    mechanic: 'cooperation',
  },

  // ── Événements ───────────────────────────────────────────────────────────────
  // Cartes événement, effets déclenchés, crises
  {
    pattern: /carte [eé]v[eé]nement|[eé]v[eé]nement[s]?\b|catastroph|crise\b|d[eé]clench(?:er|ez)|r[eé]v[eé]ler (?:une? )?carte|effet imm[eé]diat|appliquer (?:l[ea]? )?[eé]v[eé]nement|phase d[eu] (?:crise|[eé]v[eé]nement)|carte agenda|scripted event/i,
    mechanic: 'events',
  },

  // ── Enchères ──────────────────────────────────────────────────────────────────
  // Miser, offrir, remporter aux enchères
  {
    pattern: /ench[eè]re[s]?|ench[eé]rir|mise\b|miser|offre\b|offrir (?:une? )?mise|remporter (?:aux )?ench[eè]res?|vente aux ench[eè]res?|lot (?:mis aux|aux )?ench[eè]res?|surench[eé]rir|meilleur offrant|soumission|ajout(?:er)? (?:une? )?mise|passer (?:son )?tour (?:aux )?ench[eè]res?/i,
    mechanic: 'encheres',
  },

  // ── Construction / moteur ─────────────────────────────────────────────────────
  // Bâtir des structures, améliorer son moteur d'actions
  {
    pattern: /construire|bâtir|[eé]riger|construis(?:ez|ons)?|bâtissez|construire (?:une?|le|la)|améliorer? (?:sa|son|une?|le|la)|am[eé]lioration|upgrade\b|moteur\b|engine building|tableau de jeu|fiche de joueur|d[eé]velopp(?:er|ez)|expansion\b|agrandir|niveau (?:sup[eé]rieur|suivant)/i,
    mechanic: 'construction',
  },

  // ── Déduction ─────────────────────────────────────────────────────────────────
  // Trouver, éliminer, déduire par indices
  {
    pattern: /d[eé]dui(?:re|sez)|indice[s]?|accusation|[eé]liminer (?:un|le|la) (?:suspect|coupable|personnage)|enquête|enqu[eé]t(?:er|ez)|r[oô]le cach[eé]|identit[eé] secr[eè]te|trouver (?:le|la|les) (?:coupable|meurtrier|traître)|bluff(?:er|ez)?|mentir\b|informations? secr[eè]tes?/i,
    mechanic: 'deduction',
  },

  // ── Mouvement ─────────────────────────────────────────────────────────────────
  // Déplacer des pions, naviguer sur le plateau
  {
    pattern: /se d[eé]placer|d[eé]plac(?:er|ez)|avancer?|reculer?|navigu(?:er|ez)|traverser?|cheminer?|mouvement[s]?\b|d[eé]placement[s]?\b|d'une case [àa] (?:l'autre|une autre)|nombre de cases?|chemin le plus court|bloquer (?:le )?passage|d[eé]placement de (?:pion|figurine|personnage)/i,
    mechanic: 'mouvement',
  },

  // ── Gestion de main ───────────────────────────────────────────────────────────
  // Jouer des cartes depuis sa main, gérer la taille de main
  {
    pattern: /jouer (?:une? )?carte|d[eé]fausser (?:une? )?carte|garder (?:en |sa )?main|main pleine|limite de main|taille de (?:la )?main|nombre de cartes? en main|r[eé]cup[eé]rer? (?:sa|sa|une?) main|piocher (?:jusqu)[àa]|remplir sa main|cartes? en main/i,
    mechanic: 'gestion_main',
  },

  // ── Programmation / action simultanée ─────────────────────────────────────────
  // Planifier ses actions à l'avance, révélation simultanée
  {
    pattern: /planifier?|programm(?:er|ez)|ordre d[eu] (?:tour|jeu|r[eé]solution)|s[eé]quence d[eu] (?:tour|jeu)|simultan[eé](?:ment)?|r[eé]v[eé]l(?:er|ez) (?:en m[eê]me temps|simultan[eé]ment)|choisir (?:son|ses) action[s]? (?:avant|en secret|simultan[eé]ment)|action planifi[eé]e|ordre secret/i,
    mechanic: 'programmation',
  },

  // ── Rôle secret ───────────────────────────────────────────────────────────────
  // Identité cachée, traître, équipes secrètes
  {
    pattern: /r[oô]le (?:secret|cach[eé])|traître\b|identit[eé] (?:secr[eè]te|cach[eé]e)|mission (?:secr[eè]te|cach[eé]e)|[eé]quipe secr[eè]te|camp secret|r[eé]v[eé]ler son r[oô]le|cacher son r[oô]le|en secret|objectif (?:secret|cach[eé])|fid[eé]lit[eé] cach[eé]e|carte de r[oô]le/i,
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
    .map(s => s.trim())
    .filter(s => s.split(/\s+/).length >= 8);
  return sentences.slice(0, maxSentences).join(' ');
}

// ── Export principal ──────────────────────────────────────────────────────────

/**
 * Analyse NLP complète d'une section de règles en français.
 */
export function analyzeText(text: string): NlpResult {
  if (!text || text.trim().length === 0) {
    return { entites: [], actions: [], resume: '' };
  }

  return {
    entites: extractFrenchEntities(text),
    actions: extractFrenchActions(text),
    resume: extractSummary(text),
  };
}
