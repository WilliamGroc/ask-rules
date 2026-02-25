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
  /** Numéro de la première page du contenu (PDF uniquement, undefined pour TXT) */
  page_debut?: number;
  /** Numéro de la dernière page du contenu (PDF uniquement, undefined pour TXT) */
  page_fin?: number;
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
  | 'events'
  | 'encheres'
  | 'construction'
  | 'deduction'
  | 'mouvement'
  | 'gestion_main'
  | 'programmation'
  | 'role_secret';

/** Section enrichie : contenu + NLP + type + mécaniques */
export interface GameSection extends RawSection, NlpResult {
  type_section: GameSectionType;
  mecaniques: GameMechanic[];
  embedding?: number[] | null;
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

// ── Base de connaissance (PostgreSQL) ─────────────────────────────────────────

/** Section enrichie d'un identifiant unique, stockée en base */
export interface StoredSection extends GameSection {
  /** Identifiant unique : "{jeu_slug}_{index}" */
  section_id: string;
  /** Chemin hiérarchique complet (ex: "MATÉRIEL > Cartes") */
  hierarchy_path?: string;
  /** Index du chunk pour cette section (0, 1, 2...) */
  chunk_index?: number;
  /** Nombre total de chunks pour cette section */
  total_chunks?: number;
}

/** Entrée dans la base de connaissance pour un jeu */
export interface KnowledgeBaseEntry {
  /** Slug du nom du jeu (ex: "les-gardiens-du-royaume") */
  id: string;
  jeu: string;
  fichier: string;
  date_ajout: string;
  metadata: Partial<GameMetadata>;
  statistiques: Partial<Statistics>;
  sections: StoredSection[];
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
