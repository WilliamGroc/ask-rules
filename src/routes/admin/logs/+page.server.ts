/**
 * admin/logs/+page.server.ts — Affichage des logs système
 */

import 'dotenv/config';
import type { RequestEvent } from '@sveltejs/kit';
import { getRecentLogs, getLogsByType, type LogEventType } from '../../../modules/logger';

export const load = async ({ url }: RequestEvent) => {
  const eventType = url.searchParams.get('type') as LogEventType | null;
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);

  let logs;
  if (eventType) {
    logs = await getLogsByType(eventType, limit);
  } else {
    logs = await getRecentLogs(limit);
  }

  // Grouper les logs par date pour un affichage plus lisible
  const logsByDate = new Map<string, typeof logs>();
  for (const log of logs) {
    const date = new Date(log.created_at).toLocaleDateString('fr-FR');
    if (!logsByDate.has(date)) {
      logsByDate.set(date, []);
    }
    logsByDate.get(date)!.push(log);
  }

  return {
    logs,
    logsByDate: Array.from(logsByDate.entries()),
    currentFilter: eventType,
    limit,
  };
};
