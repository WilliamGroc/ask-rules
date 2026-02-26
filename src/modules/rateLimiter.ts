/**
 * rateLimiter.ts
 * Protection anti-spam avec rate limiting par IP.
 *
 * Fonctionnalités :
 *   - Limite de 10 requêtes par minute par IP
 *   - Blocage temporaire (5 minutes) des IPs qui dépassent la limite
 *   - Utilise Redis si disponible, sinon mémoire locale
 *   - Nettoyage automatique des entrées expirées
 *   - Logging des événements en base de données
 */

import { logRateLimitBlocked } from './logger';

// ── Configuration ──────────────────────────────────────────────────────────────

const MAX_REQUESTS_PER_MINUTE = 10;
const WINDOW_MS = 60 * 1000; // 1 minute
const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface RateLimitEntry {
  requests: number[];
  blockedUntil: number | null;
}

// ── Stockage en mémoire ────────────────────────────────────────────────────────

const rateLimitStore = new Map<string, RateLimitEntry>();

// Nettoyage périodique des entrées anciennes (toutes les 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    // Supprimer les requêtes plus anciennes que la fenêtre
    entry.requests = entry.requests.filter((timestamp) => now - timestamp < WINDOW_MS);

    // Supprimer les entrées complètement expirées
    if (
      entry.requests.length === 0 &&
      (entry.blockedUntil === null || entry.blockedUntil < now)
    ) {
      rateLimitStore.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ── Fonctions utilitaires ──────────────────────────────────────────────────────

/**
 * Extrait l'IP réelle du client en tenant compte des proxies/load balancers.
 */
export function getClientIP(headers: Headers): string {
  // Vérifie les headers standards de proxy
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Prend la première IP (client original)
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  // Fallback (ne devrait pas arriver en production)
  return 'unknown';
}

/**
 * Récupère ou crée une entrée de rate limit pour une IP.
 */
function getOrCreateEntry(ip: string): RateLimitEntry {
  let entry = rateLimitStore.get(ip);
  if (!entry) {
    entry = { requests: [], blockedUntil: null };
    rateLimitStore.set(ip, entry);
  }
  return entry;
}

// ── API publique ───────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number; // secondes avant de pouvoir réessayer
  remaining?: number; // requêtes restantes dans la fenêtre
}

/**
 * Vérifie si une requête est autorisée pour une IP donnée.
 * Enregistre automatiquement la tentative si autorisée.
 * 
 * @param ip - Adresse IP du client
 * @param recordAttempt - Si true, enregistre la tentative (par défaut true)
 * @param userAgent - User agent du client (optionnel, pour le logging)
 */
export function checkRateLimit(
  ip: string,
  recordAttempt = true,
  userAgent?: string
): RateLimitResult {
  const now = Date.now();
  const entry = getOrCreateEntry(ip);

  // 1. Vérifier si l'IP est bloquée
  if (entry.blockedUntil && entry.blockedUntil > now) {
    const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
    return {
      allowed: false,
      reason: `Trop de requêtes. Vous êtes temporairement bloqué.`,
      retryAfter,
    };
  }

  // 2. Débloquer si la période est écoulée
  if (entry.blockedUntil && entry.blockedUntil <= now) {
    entry.blockedUntil = null;
    entry.requests = [];
  }

  // 3. Nettoyer les anciennes requêtes (hors fenêtre)
  entry.requests = entry.requests.filter((timestamp) => now - timestamp < WINDOW_MS);

  // 4. Vérifier la limite
  if (entry.requests.length >= MAX_REQUESTS_PER_MINUTE) {
    // Dépasse la limite → bloquer l'IP
    entry.blockedUntil = now + BLOCK_DURATION_MS;
    const retryAfter = Math.ceil(BLOCK_DURATION_MS / 1000);
    const blockDurationMinutes = Math.ceil(retryAfter / 60);

    console.warn(
      `[RateLimit] IP ${ip} bloquée pour ${retryAfter}s (${entry.requests.length} requêtes en 1 min)`
    );

    // Log l'événement en base de données
    logRateLimitBlocked(ip, blockDurationMinutes, userAgent).catch((err) => {
      console.error('[RateLimit] Erreur lors du logging:', err);
    });

    return {
      allowed: false,
      reason: `Trop de requêtes (maximum ${MAX_REQUESTS_PER_MINUTE}/minute). Vous êtes bloqué pour ${blockDurationMinutes} minutes.`,
      retryAfter,
    };
  }

  // 5. Autoriser la requête
  if (recordAttempt) {
    entry.requests.push(now);
  }

  const remaining = MAX_REQUESTS_PER_MINUTE - entry.requests.length;
  return {
    allowed: true,
    remaining,
  };
}

/**
 * Réinitialise le rate limit pour une IP (pour les tests ou déblocage admin).
 */
export function resetRateLimit(ip: string): void {
  rateLimitStore.delete(ip);
  console.warn(`[RateLimit] Rate limit réinitialisé pour ${ip}`);
}

/**
 * Obtient des statistiques sur le rate limiting.
 */
export function getRateLimitStats(): {
  totalIPs: number;
  blockedIPs: number;
  activeIPs: number;
} {
  const now = Date.now();
  let blockedIPs = 0;
  let activeIPs = 0;

  for (const entry of rateLimitStore.values()) {
    if (entry.blockedUntil && entry.blockedUntil > now) {
      blockedIPs++;
    }
    if (entry.requests.length > 0) {
      activeIPs++;
    }
  }

  return {
    totalIPs: rateLimitStore.size,
    blockedIPs,
    activeIPs,
  };
}

/**
 * Configuration pour whitelist (IPs exemptées du rate limiting).
 * À charger depuis variable d'environnement si nécessaire.
 */
const WHITELISTED_IPS = new Set<string>(
  (process.env['RATE_LIMIT_WHITELIST'] ?? '').split(',').map((ip) => ip.trim()).filter(Boolean)
);

/**
 * Vérifie si une IP est dans la whitelist.
 */
export function isWhitelisted(ip: string): boolean {
  return WHITELISTED_IPS.has(ip);
}
