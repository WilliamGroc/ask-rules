# Guide du Cache Redis

## Vue d'ensemble

Le cache Redis a été intégré pour réduire les coûts d'utilisation des LLM et améliorer les temps de réponse pour les questions fréquentes ou récurrentes.

### Fonctionnement

1. **Vérification du cache** : Avant chaque appel au LLM, le système vérifie si une réponse existe déjà dans Redis
2. **Cache HIT** : Si la question est trouvée, la réponse est retournée immédiatement depuis Redis
3. **Cache MISS** : Si la question n'est pas en cache, le système :
   - Récupère les sections pertinentes depuis PostgreSQL
   - Appelle le LLM pour générer une réponse
   - Stocke la réponse complète dans Redis pour 24h
4. **Mode graceful** : Si Redis n'est pas disponible, l'application continue de fonctionner normalement sans cache

## Configuration

### 1. Installation de Redis

#### Avec Docker (recommandé pour développement)

```bash
docker run -d \
  --name ask-rules-redis \
  -p 6379:6379 \
  redis:7-alpine
```

#### Avec Docker Compose

Ajoutez à votre `docker-compose.yml` :

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

#### Installation native (Linux)

```bash
# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis-server

# ArchLinux
sudo pacman -S redis
sudo systemctl start redis
```

### 2. Configuration de l'application

Ajoutez à votre fichier `.env` :

```env
# Connexion Redis (ajustez selon votre configuration)
REDIS_URL=redis://localhost:6379

# Optionnel : désactiver explicitement le cache
# REDIS_ENABLED=false
```

#### Formats d'URL Redis supportés

```env
# Local sans authentification
REDIS_URL=redis://localhost:6379

# Avec mot de passe
REDIS_URL=redis://:mypassword@localhost:6379

# Base de données spécifique (0-15)
REDIS_URL=redis://localhost:6379/1

# Redis Cloud / Managed
REDIS_URL=redis://username:password@redis-12345.cloud.redislabs.com:12345

# TLS/SSL
REDIS_URL=rediss://username:password@secure-redis.example.com:6380
```

### 3. Installation de la dépendance

```bash
pnpm install
```

La dépendance `redis` est maintenant incluse dans `package.json`.

## Fonctionnalités

### Génération des clés de cache

Les clés sont générées à partir de :

- **Question normalisée** : Convertie en minuscules, espaces multiples supprimés, ponctuation finale retirée
- **ID du jeu** : Si un jeu spécifique est sélectionné, sinon "auto"
- **Hash SHA-256** : Pour garantir l'unicité et limiter la longueur

Format : `ask-rules:q:{hash}:{jeu_id}`

Exemple : `ask-rules:q:a3f9c2b148e6d7f1:anachrony`

### Durée de vie (TTL)

Par défaut, les réponses sont conservées **24 heures** (86400 secondes).

Cette durée peut être modifiée dans `/src/modules/cacheClient.ts` :

```typescript
const DEFAULT_TTL = 60 * 60 * 24; // 24 heures
```

### Normalisation des questions

Le système normalise les questions pour améliorer le taux de hit du cache :

```typescript
"Comment jouer à Anachrony ?"   → "comment jouer à anachrony"
"Comment jouer à Anachrony  ? " → "comment jouer à anachrony"
"Comment jouer à Anachrony."    → "comment jouer à anachrony"
```

Ces trois questions seront considérées comme identiques et partageront le même cache.

## Vérification du statut

### Logs de l'application

Le cache affiche des logs pour suivre son activité :

```
[Cache] Redis connecté avec succès
[Cache] HIT pour la question: "Comment gagner à Anachrony..."
[Cache] Réponse mise en cache pour "Quelles sont les phases de jeu..."
[Cache] MISS pour la question: "Combien de joueurs..."
```

### Mode sans cache

Si Redis n'est pas configuré ou inaccessible :

```
[Cache] REDIS_URL non défini, cache désactivé
[Cache] L'application continuera sans cache
```

L'application fonctionne normalement, chaque question déclenchera un appel au LLM.

## Interface utilisateur

### Indicateur de cache

Les réponses servies depuis le cache incluent le champ `cached: true` dans la réponse.
Vous pouvez afficher un badge dans l'interface pour indiquer quand une réponse provient du cache :

```svelte
{#if form?.cached}
  <span class="badge">⚡ Réponse en cache</span>
{/if}
```

### Timestamp de mise en cache

Le champ `cached_at` contient la date ISO de mise en cache :

```json
{
  "cached": true,
  "cached_at": "2026-02-26T10:30:45.123Z",
  ...
}
```

## Commandes utiles

### Connexion à Redis CLI

```bash
# Docker
docker exec -it ask-rules-redis redis-cli

# Local
redis-cli
```

### Commandes Redis utiles

```redis
# Lister toutes les clés ask-rules
KEYS "ask-rules:*"

# Voir une clé spécifique
GET "ask-rules:q:a3f9c2b148e6d7f1:anachrony"

# Voir le TTL d'une clé (en secondes)
TTL "ask-rules:q:a3f9c2b148e6d7f1:anachrony"

# Supprimer une clé
DEL "ask-rules:q:a3f9c2b148e6d7f1:anachrony"

# Supprimer toutes les clés ask-rules (⚠ attention en production)
EVAL "return redis.call('del', unpack(redis.call('keys', 'ask-rules:*')))" 0

# Statistiques
INFO stats
```

## Production

### Recommandations

1. **Persistance** : Configurez Redis avec AOF (Append-Only File) pour la durabilité

```bash
redis-server --appendonly yes
```

2. **Éviction** : Configurez une politique d'éviction si la mémoire est limitée

```bash
redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
```

3. **Monitoring** : Surveillez les métriques Redis
   - Taux de hit/miss
   - Utilisation mémoire
   - Latence

4. **Sécurité** :
   - Utilisez toujours un mot de passe : `requirepass your-strong-password`
   - Activez TLS si Redis est sur un réseau non sécurisé
   - Limitez l'accès avec des règles firewall

### Services managés

Pour la production, considérez des services Redis managés :

- **AWS ElastiCache** : Redis compatible, haute disponibilité
- **Redis Cloud** : Service officiel Redis
- **Google Cloud Memorystore** : Redis géré par Google
- **Azure Cache for Redis** : Service Microsoft

Avantages :

- Sauvegardes automatiques
- Haute disponibilité / réplication
- Monitoring intégré
- Mises à jour automatiques

## Performance

### Gains attendus

- **Latence** : ~50-200ms depuis le cache vs 1-5s depuis le LLM
- **Coûts** : Économies significatives sur les questions fréquentes
- **Charge serveur** : Réduit la charge sur PostgreSQL et les API LLM

### Métriques à surveiller

1. **Taux de hit** : `hits / (hits + misses) * 100`
2. **Latence moyenne** : Comparer cache vs LLM
3. **Taille du cache** : Surveiller la croissance

## Dépannage

### Redis ne se connecte pas

```bash
# Vérifier que Redis est démarré
redis-cli ping
# Doit répondre : PONG

# Vérifier les logs Redis
docker logs ask-rules-redis
# ou
journalctl -u redis-server

# Tester la connexion avec l'URL
redis-cli -u redis://localhost:6379 ping
```

### Erreur "WRONGPASS"

Votre instance Redis nécessite un mot de passe :

```env
REDIS_URL=redis://:your-password@localhost:6379
```

### Cache ne fonctionne pas

Vérifiez les logs de l'application pour voir si Redis s'est connecté.
Si vous voyez `[Cache] L'application continuera sans cache`, Redis n'est pas accessible.

### Vider le cache

```bash
# Supprimer toutes les clés ask-rules
redis-cli --eval <(echo "return redis.call('del', unpack(redis.call('keys', ARGV[1])))") , "ask-rules:*"

# Ou via redis-cli interactif
redis-cli
> EVAL "return redis.call('del', unpack(redis.call('keys', 'ask-rules:*')))" 0
```

## Désactiver le cache

Pour désactiver temporairement le cache sans arrêter Redis :

```env
REDIS_ENABLED=false
```

Ou commentez/supprimez `REDIS_URL` dans votre `.env`.

## Développement

### Tester le cache

1. Lancez Redis :

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

2. Configurez `.env` :

```env
REDIS_URL=redis://localhost:6379
```

3. Lancez l'application :

```bash
pnpm dev
```

4. Posez une question deux fois et observez les logs :

```
[Cache] MISS pour la question: "comment jouer..."
[Cache] Réponse mise en cache pour "comment jouer..."
[Cache] HIT pour la question: "comment jouer..."
```

### Personnalisation

Modifiez `/src/modules/cacheClient.ts` pour :

- Changer le TTL par défaut
- Ajuster la logique de normalisation
- Ajouter des métriques personnalisées
- Implémenter un cache multi-niveaux

## Architecture

```
┌─────────────┐
│  Utilisateur │
└──────┬──────┘
       │ Question
       ▼
┌─────────────────┐
│  SvelteKit      │
│  +page.server.ts│
└──────┬──────────┘
       │
       ▼
┌──────────────────┐
│  cacheClient.ts  │◄────► Redis (Cache)
└──────┬───────────┘       ├─ TTL: 24h
       │                   ├─ Clé: hash(question) + jeu
       │ Cache MISS        └─ Valeur: Réponse complète
       ▼
┌──────────────────┐
│  retriever.ts    │◄────► PostgreSQL + pgvector
│  llmClient.ts    │◄────► LLM API (Mistral/OpenAI/Ollama)
└──────┬───────────┘
       │
       ▼
   Réponse → Cache → Utilisateur
```

## Résumé

Le cache Redis offre :

- ✅ **Économies** : Réduit les coûts API pour les questions récurrentes
- ✅ **Performance** : Réponses instantanées depuis le cache
- ✅ **Résilience** : Mode graceful si Redis est indisponible
- ✅ **Simple** : Configuration en une variable d'environnement
- ✅ **Production-ready** : Compatible avec les services managés

Pour toute question ou problème, consultez les logs de l'application et Redis.
