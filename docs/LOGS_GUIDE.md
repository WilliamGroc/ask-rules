# Guide du Système de Logs

## Vue d'ensemble

Un système de logging centralisé a été intégré pour tracer les événements importants de l'application en base de données PostgreSQL.

## Types d'événements

### Gestion des jeux

- **`game_added`** : Ajout d'un nouveau jeu à la base de connaissances
- **`game_updated`** : Mise à jour d'un jeu existant (ré-import)
- **`game_deleted`** : Suppression d'un jeu

### Protection anti-spam

- **`rate_limit_hit`** : Une IP a dépassé la limite de requêtes
- **`rate_limit_blocked`** : Une IP a été bloquée temporairement

## Structure des logs

Chaque log contient :

```typescript
{
  id: number; // ID unique auto-incrémenté
  event_type: string; // Type d'événement (voir ci-dessus)
  message: string; // Message descriptif
  metadata: object | null; // Données structurées spécifiques à l'événement
  ip_address: string | null; // IP du client (pour rate limiting)
  user_agent: string | null; // User agent du client
  created_at: timestamp; // Date et heure de l'événement
}
```

## Exemples de logs

### Ajout de jeu

```json
{
  "event_type": "game_added",
  "message": "Jeu ajouté : Anachrony",
  "metadata": {
    "game_id": "anachrony",
    "game_name": "Anachrony",
    "file_name": "anachrony.pdf",
    "sections_count": 42
  },
  "created_at": "2026-02-26T14:30:00Z"
}
```

### Blocage d'IP

```json
{
  "event_type": "rate_limit_blocked",
  "message": "IP bloquée : 192.168.1.50 (5 minutes)",
  "metadata": {
    "block_duration_minutes": 5
  },
  "ip_address": "192.168.1.50",
  "user_agent": "Mozilla/5.0 ...",
  "created_at": "2026-02-26T14:35:00Z"
}
```

## Migration

La table `logs` est créée automatiquement lors de l'exécution de la migration :

```bash
pnpm run migrate
```

### Structure de la table

```sql
CREATE TABLE logs (
  id          SERIAL       PRIMARY KEY,
  event_type  TEXT         NOT NULL,
  message     TEXT         NOT NULL,
  metadata    JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index pour optimiser les requêtes fréquentes
CREATE INDEX logs_event_type_idx ON logs(event_type);
CREATE INDEX logs_created_at_idx ON logs(created_at DESC);
CREATE INDEX logs_ip_address_idx ON logs(ip_address) WHERE ip_address IS NOT NULL;
```

## Utilisation dans le code

### Logger un événement

```typescript
import { logEvent } from '../modules/logger';

await logEvent({
  event_type: 'custom_event',
  message: "Description de l'événement",
  metadata: { key: 'value' },
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0...',
});
```

### Fonctions spécialisées

```typescript
import {
  logGameAdded,
  logGameUpdated,
  logGameDeleted,
  logRateLimitBlocked,
} from '../modules/logger';

// Log l'ajout d'un jeu
await logGameAdded('anachrony', 'Anachrony', 'anachrony.pdf', 42);

// Log une IP bloquée
await logRateLimitBlocked('192.168.1.50', 5, 'Mozilla/5.0...');
```

### Récupérer les logs

```typescript
import { getRecentLogs, getLogsByType, getLogsByIP } from '../modules/logger';

// 100 derniers logs
const logs = await getRecentLogs(100);

// Logs d'un type spécifique
const rateLimitLogs = await getLogsByType('rate_limit_blocked', 50);

// Logs d'une IP spécifique
const ipLogs = await getLogsByIP('192.168.1.50', 20);
```

## Interface d'administration

### Accès

Accessible via le menu d'administration : `/admin/logs`

### Fonctionnalités

- **Affichage chronologique** : Logs groupés par date
- **Filtres par type** : Filtrer par type d'événement
- **Détails** : Affichage du message, métadonnées, IP, user agent
- **Pagination** : Limite configurable (par défaut 100)

### Captures d'écran

```
┌─────────────────────────────────────────┐
│ 📋 Logs système                         │
│ Historique des événements (156 entrées) │
├─────────────────────────────────────────┤
│ [Tous] [🎲 Jeux] [🔄 MAJ] [🚫 Bloqués]  │
├─────────────────────────────────────────┤
│ 26 février 2026                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🎲 Jeu ajouté       14:30:15        │ │
│ │ Jeu ajouté : Anachrony              │ │
│ │ ▸ Détails                           │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 🚫 IP bloquée       14:25:03        │ │
│ │ IP bloquée : 192.168.1.50 (5 min)  │ │
│ │ IP: 192.168.1.50                    │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## Nettoyage des logs

### Automatique (recommandé)

Créer une tâche cron pour nettoyer les logs anciens :

```bash
# Supprimer les logs de plus de 90 jours
0 2 * * * cd /path/to/app && node -e "require('./src/modules/logger').cleanOldLogs(90)"
```

### Manuel

```typescript
import { cleanOldLogs } from '../modules/logger';

// Supprimer les logs de plus de 90 jours
const deletedCount = await cleanOldLogs(90);
console.log(`${deletedCount} logs supprimés`);
```

### Via SQL

```sql
-- Supprimer les logs de plus de 90 jours
DELETE FROM logs WHERE created_at < NOW() - INTERVAL '90 days';

-- Supprimer tous les logs d'un type
DELETE FROM logs WHERE event_type = 'rate_limit_hit';

-- Supprimer les logs d'une IP spécifique
DELETE FROM logs WHERE ip_address = '192.168.1.50';
```

## Performances

### Index

La table utilise des index pour optimiser :

- Filtrage par type d'événement
- Tri par date (DESC pour les plus récents d'abord)
- Recherche par IP

### Volumétrie

Estimation de la croissance :

- **Rate limiting** : ~10-100 logs/jour (selon le trafic et les abus)
- **Jeux** : ~1-10 logs/jour (ajouts/mises à jour)
- **Total** : ~50-500 MB/an pour un site moyen

### Recommandations

1. **Rétention** : Conserver 90 jours de logs (ajustable selon les besoins)
2. **Archivage** : Exporter les logs vers un système externe (S3, CloudWatch, etc.) avant suppression
3. **Monitoring** : Surveiller la croissance de la table

```sql
-- Taille de la table logs
SELECT
  pg_size_pretty(pg_total_relation_size('logs')) as table_size,
  COUNT(*) as row_count
FROM logs;
```

## Monitoring et alertes

### Détection d'attaques

Surveiller les blocages fréquents :

```sql
-- IPs bloquées dans les dernières 24h
SELECT
  ip_address,
  COUNT(*) as block_count
FROM logs
WHERE event_type = 'rate_limit_blocked'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY ip_address
ORDER BY block_count DESC;
```

### Activité des jeux

```sql
-- Jeux les plus importés/mis à jour
SELECT
  metadata->>'game_name' as game,
  COUNT(*) as import_count,
  MAX(created_at) as last_import
FROM logs
WHERE event_type IN ('game_added', 'game_updated')
GROUP BY metadata->>'game_name'
ORDER BY import_count DESC;
```

## Intégration avec des outils externes

### Sentry

```typescript
import * as Sentry from '@sentry/node';
import { logEvent } from '../modules/logger';

await logEvent({
  event_type: 'error',
  message: error.message,
  metadata: { stack: error.stack },
});

Sentry.captureException(error);
```

### DataDog / CloudWatch

Exporter les logs via un cron :

```bash
# Export JSON des dernières 24h
psql $DATABASE_URL -c "
  COPY (
    SELECT row_to_json(logs.*)
    FROM logs
    WHERE created_at > NOW() - INTERVAL '24 hours'
  ) TO STDOUT
" | aws s3 cp - s3://my-bucket/logs/$(date +%Y-%m-%d).json
```

## Sécurité

### Données sensibles

⚠️ **Ne jamais** logger :

- Mots de passe
- Tokens d'authentification
- Données personnelles sensibles (numéros de carte, etc.)

### RGPD

Les logs contenant des IPs sont considérés comme des données personnelles :

- Informer les utilisateurs dans la politique de confidentialité
- Permettre la suppression sur demande
- Ne conserver que la durée nécessaire

```typescript
// Anonymiser les IPs dans les logs
function anonymizeIP(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return 'xxx.xxx.xxx.xxx';
}
```

## Résumé

Le système de logs offre :

- ✅ **Traçabilité** : Historique complet des événements
- ✅ **Sécurité** : Détection des abus et attaques
- ✅ **Debugging** : Facilite l'investigation des problèmes
- ✅ **Audit** : Preuve des actions effectuées
- ✅ **Analytics** : Statistiques d'utilisation

Pour toute question ou problème, consultez les logs de l'application et la documentation PostgreSQL.
