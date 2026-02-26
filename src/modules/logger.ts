/**
 * logger.ts
 * Module de logging centralisé pour enregistrer les événements en base de données.
 *
 * Types d'événements supportés :
 *   - game_added       : Ajout d'un nouveau jeu
 *   - game_updated     : Mise à jour d'un jeu existant
 *   - rate_limit_hit   : Dépassement de la limite de rate limiting
 *   - game_deleted     : Suppression d'un jeu
 */

import pool from './db';

// ── Types ──────────────────────────────────────────────────────────────────────

export type LogEventType =
  | 'game_added'
  | 'game_updated'
  | 'game_deleted'
  | 'rate_limit_hit'
  | 'rate_limit_blocked';

export interface LogEntry {
  event_type: LogEventType;
  message: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

// ── Fonctions publiques ────────────────────────────────────────────────────────

/**
 * Enregistre un événement dans la table de logs.
 */
export async function logEvent(entry: LogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO logs (event_type, message, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        entry.event_type,
        entry.message,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.ip_address ?? null,
        entry.user_agent ?? null,
      ]
    );
  } catch (error) {
    // Ne pas faire échouer l'opération principale si le logging échoue
    console.error('[Logger] Erreur lors de l\'enregistrement du log:', error);
  }
}

/**
 * Log l'ajout d'un nouveau jeu.
 */
export async function logGameAdded(
  gameId: string,
  gameName: string,
  fileName: string,
  sectionsCount: number
): Promise<void> {
  await logEvent({
    event_type: 'game_added',
    message: `Jeu ajouté : ${gameName}`,
    metadata: {
      game_id: gameId,
      game_name: gameName,
      file_name: fileName,
      sections_count: sectionsCount,
    },
  });
}

/**
 * Log la mise à jour d'un jeu existant.
 */
export async function logGameUpdated(
  gameId: string,
  gameName: string,
  fileName: string,
  sectionsCount: number
): Promise<void> {
  await logEvent({
    event_type: 'game_updated',
    message: `Jeu mis à jour : ${gameName}`,
    metadata: {
      game_id: gameId,
      game_name: gameName,
      file_name: fileName,
      sections_count: sectionsCount,
    },
  });
}

/**
 * Log la suppression d'un jeu.
 */
export async function logGameDeleted(gameId: string, gameName: string): Promise<void> {
  await logEvent({
    event_type: 'game_deleted',
    message: `Jeu supprimé : ${gameName}`,
    metadata: {
      game_id: gameId,
      game_name: gameName,
    },
  });
}

/**
 * Log un dépassement de limite du rate limiter.
 */
export async function logRateLimitHit(
  ipAddress: string,
  requestCount: number,
  userAgent?: string
): Promise<void> {
  await logEvent({
    event_type: 'rate_limit_hit',
    message: `Rate limit dépassé par ${ipAddress}`,
    metadata: {
      request_count: requestCount,
      limit: 10,
    },
    ip_address: ipAddress,
    user_agent: userAgent,
  });
}

/**
 * Log un blocage effectif d'une IP.
 */
export async function logRateLimitBlocked(
  ipAddress: string,
  blockDurationMinutes: number,
  userAgent?: string
): Promise<void> {
  await logEvent({
    event_type: 'rate_limit_blocked',
    message: `IP bloquée : ${ipAddress} (${blockDurationMinutes} minutes)`,
    metadata: {
      block_duration_minutes: blockDurationMinutes,
    },
    ip_address: ipAddress,
    user_agent: userAgent,
  });
}

/**
 * Récupère les N derniers logs.
 */
export async function getRecentLogs(limit = 100): Promise<
  Array<{
    id: number;
    event_type: LogEventType;
    message: string;
    metadata: Record<string, unknown> | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: Date;
  }>
> {
  const result = await pool.query(
    `SELECT id, event_type, message, metadata, ip_address, user_agent, created_at
     FROM logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Récupère les logs par type d'événement.
 */
export async function getLogsByType(
  eventType: LogEventType,
  limit = 100
): Promise<
  Array<{
    id: number;
    event_type: LogEventType;
    message: string;
    metadata: Record<string, unknown> | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: Date;
  }>
> {
  const result = await pool.query(
    `SELECT id, event_type, message, metadata, ip_address, user_agent, created_at
     FROM logs
     WHERE event_type = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [eventType, limit]
  );
  return result.rows;
}

/**
 * Récupère les logs par IP.
 */
export async function getLogsByIP(ipAddress: string, limit = 50): Promise<
  Array<{
    id: number;
    event_type: LogEventType;
    message: string;
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>
> {
  const result = await pool.query(
    `SELECT id, event_type, message, metadata, created_at
     FROM logs
     WHERE ip_address = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [ipAddress, limit]
  );
  return result.rows;
}

/**
 * Supprime les logs plus anciens que X jours.
 */
export async function cleanOldLogs(daysToKeep = 90): Promise<number> {
  const result = await pool.query(
    `DELETE FROM logs
     WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [daysToKeep]
  );
  return result.rowCount ?? 0;
}
