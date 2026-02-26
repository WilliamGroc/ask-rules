/**
 * cacheClient.ts
 * Client Redis pour la mise en cache des questions/réponses.
 *
 * Fonctionnalités :
 *   - Cache les réponses LLM pour réduire les coûts et améliorer la latence
 *   - Génère des clés basées sur un hash de la question normalisée + jeu_id
 *   - TTL configurable (par défaut 24h)
 *   - Gestion graceful : si Redis est indisponible, l'app continue sans cache
 */

import { createHash } from 'crypto';
import { createClient, type RedisClientType } from 'redis';

type BaseRedisClientType = RedisClientType;
// ── Types ──────────────────────────────────────────────────────────────────────

export interface CachedResponse {
  jeu: string;
  jeu_id: string;
  matchedName?: boolean;
  answer: string;
  used_llm: boolean;
  model: string;
  fichier: string | null;
  sections: Array<{
    titre: string;
    type_section: string;
    resume: string | null;
    contenu: string | null;
    score: number;
    page_debut: number | null;
    page_fin: number | null;
  }>;
  cached: boolean;
  cached_at?: string;
}

// ── Configuration Redis ────────────────────────────────────────────────────────


let redisClient: BaseRedisClientType | null = null;
let redisAvailable = false;

// TTL par défaut : 24 heures
const DEFAULT_TTL = 60 * 60 * 24;

/**
 * Initialise le client Redis de manière lazy.
 * Si Redis n'est pas configuré ou inaccessible, l'application continue sans cache.
 */
async function getRedisClient(): Promise<BaseRedisClientType | null> {
  // Déjà initialisé et disponible
  if (redisClient && redisAvailable) return redisClient;

  // Redis désactivé via variable d'environnement
  if (process.env['REDIS_ENABLED'] === 'false') {
    console.error('[Cache] Redis désactivé via REDIS_ENABLED=false');
    redisAvailable = false;
    return null;
  }

  // Pas de configuration Redis
  const redisUrl = process.env['REDIS_URL'];
  if (!redisUrl) {
    console.error('[Cache] REDIS_URL non défini, cache désactivé');
    redisAvailable = false;
    return null;
  }

  try {
    const client = createClient({ url: redisUrl });

    // Gestion des erreurs Redis
    client.on?.('error', (err: Error) => {
      console.error('[Cache] Erreur Redis:', err.message);
      redisAvailable = false;
    });

    await client.connect?.();
    redisClient = client as BaseRedisClientType;
    redisAvailable = true;

    console.log('[Cache] Redis connecté avec succès');
    return redisClient;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Cache] Impossible de se connecter à Redis: ${msg}`);
    console.error('[Cache] L\'application continuera sans cache');
    redisAvailable = false;
    return null;
  }
}

// ── Fonctions utilitaires ──────────────────────────────────────────────────────

/**
 * Normalise une question pour améliorer le taux de hit du cache :
 * - Supprime les espaces multiples
 * - Convertit en minuscules
 * - Retire la ponctuation excessive
 */
function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Espaces multiples → un seul espace
    .replace(/[?!.]+$/g, ''); // Retire ponctuation finale
}

/**
 * Génère une clé de cache unique basée sur la question et le jeu.
 * Format: reglomatic:q:{hash}:{jeu_id}
 */
export function generateCacheKey(question: string, jeuId: string | null): string {
  const normalized = normalizeQuestion(question);
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  const jeuPart = jeuId ?? 'auto';
  return `reglomatic:q:${hash}:${jeuPart}`;
}

// ── API publique ───────────────────────────────────────────────────────────────

/**
 * Récupère une réponse du cache si elle existe.
 */
export async function getCachedResponse(
  question: string,
  jeuId: string | null
): Promise<CachedResponse | null> {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const key = generateCacheKey(question, jeuId);
    const cached = await client.get(key);

    if (cached) {
      const data = JSON.parse(cached) as CachedResponse;
      // Cache HIT - log en dev uniquement
      if (process.env['NODE_ENV'] !== 'production') {
        console.error(`[Cache] HIT pour: "${question.slice(0, 50)}..."`);
      }
      return { ...data, cached: true };
    }

    // Cache MISS - pas de log pour réduire le bruit
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Cache] Erreur lors de la lecture: ${msg}`);
    return null;
  }
}

/**
 * Met en cache une réponse.
 * @param ttl - Durée de vie en secondes (par défaut 24h)
 */
export async function setCachedResponse(
  question: string,
  jeuId: string | null,
  response: Omit<CachedResponse, 'cached' | 'cached_at'>,
  ttl?: number
): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  try {
    const key = generateCacheKey(question, jeuId);
    const cacheData: CachedResponse = {
      ...response,
      cached: true,
      cached_at: new Date().toISOString(),
    };

    await client.setEx(key, ttl ?? DEFAULT_TTL, JSON.stringify(cacheData));
    // Log en dev uniquement
    if (process.env['NODE_ENV'] !== 'production') {
      console.error(`[Cache] Stocké: "${question.slice(0, 50)}..."`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Cache] Erreur lors de l'écriture: ${msg}`);
  }
}

/**
 * Ferme proprement la connexion Redis (à appeler lors de l'arrêt de l'app).
 */
export async function closeCacheClient(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.quit();
      console.error('[Cache] Connexion Redis fermée');
    } catch (error) {
      console.error('[Cache] Erreur lors de la fermeture:', error);
    }
  }
  redisClient = null;
  redisAvailable = false;
}
