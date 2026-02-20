/**
 * types.ts — Interfaces TypeScript pour l'analyse de règles de jeu de société
 */

/** Catégorie sémantique d'une section de règles */
export type GameSectionType =
  | 'presentation'
  | 'but_du_jeu'
  | 'materiel'
  | 'preparation'
  | 'tour_de_jeu'
  | 'cartes_evenement'
  | 'regles_speciales'
  | 'victoire'
  | 'variante'
  | 'conseils'
  | 'autre';

/** Résultat brut du découpage en sections (avant enrichissement) */
export interface RawSection {
  titre: string;
  contenu: string;
  /** Niveau hiérarchique : 1 = chapitre principal, 2 = sous-section, 3 = sous-sous-section */
  niveau: 1 | 2 | 3;
}

/** Résultat de l'analyse NLP française d'une section */
export interface NlpResult {
  /** Noms clés du jeu : pions, cartes, ressources, lieux... */
  entites: string[];
  /** Verbes d'action à l'infinitif : placer, piocher, attaquer... */
  actions: string[];
  /** Résumé extractif (2 premières phrases significatives) */
  resume: string;
}

/** Mécaniques de jeu détectées dans une section */
export type GameMechanic =
  | 'placement'
  | 'pioche'
  | 'gestion_ressources'
  | 'combat_des'
  | 'controle_territoire'
  | 'commerce'
  | 'draft_cartes'
  | 'points_victoire'
  | 'cooperation'
  | 'events';

/** Vecteur d'embedding : dense (OpenAI) ou creux (TF-IDF) */
export type EmbeddingVector = number[] | Record<string, number>;

/** Section enrichie : contenu + NLP + type + mécaniques */
export interface GameSection extends RawSection, NlpResult {
  type_section: GameSectionType;
  mecaniques: GameMechanic[];
  embedding?: EmbeddingVector | null;
}

/** Métadonnées extraites de l'en-tête du document */
export interface GameMetadata {
  joueurs_min: number | null;
  joueurs_max: number | null;
  age_minimum: number | null;
  duree_minutes_min: number | null;
  duree_minutes_max: number | null;
}

/** Statistiques globales de l'analyse */
export interface Statistics {
  caracteres: number;
  mots: number;
  sections: number;
  entites_total: number;
  actions_total: number;
  mecaniques_detectees: GameMechanic[];
}

/** Structure JSON de sortie complète */
export interface GameAnalysisResult {
  jeu: string;
  fichier: string;
  date_analyse: string;
  metadata: GameMetadata;
  statistiques: Statistics;
  sections: GameSection[];
}

// ── Base de connaissance ──────────────────────────────────────────────────────

/** Section enrichie d'un vecteur TF-IDF pour la recherche sémantique */
export interface StoredSection extends GameSection {
  /** Identifiant unique : "{jeu_slug}_{index}" */
  section_id: string;
  /** Vecteur TF-IDF creux (French tokenization) utilisé pour la similarité cosinus */
  tfidf_vector: Record<string, number>;
}

/** Entrée dans la base de connaissance pour un jeu */
export interface KnowledgeBaseEntry {
  /** Slug du nom du jeu (ex: "les-gardiens-du-royaume") */
  id: string;
  jeu: string;
  fichier: string;
  date_ajout: string;
  metadata: GameMetadata;
  statistiques: Statistics;
  sections: StoredSection[];
}

/** Base de connaissance complète (persist dans data/knowledge-base.json) */
export interface KnowledgeBase {
  version: string;
  updated_at: string;
  games: KnowledgeBaseEntry[];
}

/** Résultat d'une récupération sémantique */
export interface ScoredSection {
  score: number;
  section: StoredSection;
  jeu: string;
  jeu_id: string;
}

/** Résultat d'une requête LLM */
export interface LLMResponse {
  answer: string;
  model: string;
  used_llm: boolean;
}
