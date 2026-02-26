# Guide de Protection Anti-Spam (Rate Limiting)

## Vue d'ensemble

Un système de rate limiting a été intégré pour protéger l'application contre les abus et le spam. Il limite le nombre de questions qu'un utilisateur peut poser par minute.

### Paramètres par défaut

- **Limite** : 10 questions par minute
- **Fenêtre** : 60 secondes
- **Blocage** : 5 minutes après dépassement de la limite
- **Stockage** : Mémoire locale (RAM)

## Fonctionnement

### 1. Suivi des requêtes

Chaque fois qu'un utilisateur pose une question, son adresse IP est enregistrée avec l'horodatage de la requête.

### 2. Vérification de la limite

Avant de traiter une question :

1. Le système compte combien de requêtes l'IP a effectuées dans les 60 dernières secondes
2. Si le nombre dépasse 10, la requête est rejetée
3. L'IP est bloquée pour 5 minutes

### 3. Nettoyage automatique

Un processus périodique (toutes les 5 minutes) nettoie automatiquement les entrées expirées pour éviter une croissance excessive de la mémoire.

## Détection de l'IP

Le système détecte l'IP réelle du client même derrière des proxies ou load balancers en vérifiant les headers suivants (par ordre de priorité) :

1. `X-Forwarded-For` (prend la première IP de la liste)
2. `X-Real-IP`
3. Fallback : 'unknown'

### Configuration pour les proxies

Si votre application est derrière un reverse proxy (Nginx, Apache, CloudFlare, etc.), assurez-vous que le proxy transmet correctement les headers :

**Nginx :**

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Host $host;
}
```

**Apache :**

```apache
ProxyPass / http://localhost:3000/
ProxyPassReverse / http://localhost:3000/
ProxyPreserveHost On
```

## Whitelist d'IPs

Vous pouvez exempter certaines IPs du rate limiting (utile pour les tests, développement, ou IPs de confiance).

### Configuration

Ajoutez dans votre fichier `.env` :

```env
# Liste d'IPs exemptées (séparées par des virgules)
RATE_LIMIT_WHITELIST=127.0.0.1,::1,192.168.1.100
```

### IPs courantes à whitelister

- `127.0.0.1` : localhost IPv4
- `::1` : localhost IPv6
- Votre IP de développement
- IPs des serveurs de monitoring
- IPs des tests automatisés

## Messages utilisateur

### Limite dépassée

Quand un utilisateur dépasse la limite, il reçoit un message d'erreur :

```
🚫 Trop de requêtes (maximum 10/minute).
Vous êtes bloqué pour 5 minutes.
Réessayez dans 5 minutes.
```

### Interface visuelle

L'erreur s'affiche avec :

- Fond orange (différent des erreurs normales en rouge)
- Icône 🚫
- Indication du délai d'attente

## Personnalisation

Les paramètres du rate limiting peuvent être modifiés dans `/src/modules/rateLimiter.ts` :

```typescript
// Limite de requêtes par fenêtre
const MAX_REQUESTS_PER_MINUTE = 10;

// Durée de la fenêtre (en millisecondes)
const WINDOW_MS = 60 * 1000; // 1 minute

// Durée du blocage (en millisecondes)
const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
```

### Exemples d'ajustements

**Plus strict (API payante) :**

```typescript
const MAX_REQUESTS_PER_MINUTE = 5;
const BLOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes
```

**Plus permissif (usage interne) :**

```typescript
const MAX_REQUESTS_PER_MINUTE = 20;
const BLOCK_DURATION_MS = 2 * 60 * 1000; // 2 minutes
```

## Monitoring

### Statistiques en temps réel

Le module expose une fonction pour obtenir des statistiques :

```typescript
import { getRateLimitStats } from '../modules/rateLimiter';

const stats = getRateLimitStats();
console.log(stats);
// {
//   totalIPs: 45,      // Nombre total d'IPs trackées
//   blockedIPs: 3,     // Nombre d'IPs actuellement bloquées
//   activeIPs: 12      // Nombre d'IPs avec requêtes récentes
// }
```

### Logs

Les blocages sont automatiquement loggés :

```
[RateLimit] IP 192.168.1.50 bloquée pour 300s (11 requêtes en 1 min)
```

## Administration

### Débloquer une IP manuellement

Vous pouvez réinitialiser le rate limit d'une IP spécifique :

```typescript
import { resetRateLimit } from '../modules/rateLimiter';

// Débloquer une IP
resetRateLimit('192.168.1.50');
```

Cette fonction peut être intégrée dans une page d'administration.

### Créer une route de déblocage (optionnel)

```typescript
// src/routes/admin/unblock/+server.ts
import { resetRateLimit } from '../../../modules/rateLimiter';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
  const { ip } = await request.json();

  // Vérifier les permissions admin ici

  resetRateLimit(ip);
  return json({ success: true });
}
```

## Limitations actuelles

### Stockage en mémoire

Le système utilise une `Map` en mémoire, ce qui signifie :

✅ **Avantages :**

- Très rapide (pas d'I/O)
- Aucune dépendance externe
- Simple à maintenir

❌ **Inconvénients :**

- Les données sont perdues au redémarrage
- Ne fonctionne pas avec plusieurs instances (load balancing)
- Limité à la RAM disponible

### Pour du multi-instances

Si vous avez plusieurs instances de l'application (load balancing horizontal), utilisez Redis pour partager l'état :

```typescript
// Exemple d'implémentation Redis (à développer)
async function checkRateLimitRedis(ip: string): Promise<RateLimitResult> {
  const key = `ratelimit:${ip}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 60); // 60 secondes
  }

  if (count > MAX_REQUESTS_PER_MINUTE) {
    return { allowed: false, reason: 'Trop de requêtes' };
  }

  return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - count };
}
```

## Tests

### Tester le rate limiting

```bash
# Envoyer 15 requêtes rapidement
for i in {1..15}; do
  curl -X POST http://localhost:5173 \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "question=Test+$i&jeu=" \
    --silent -o /dev/null -w "Request $i: %{http_code}\n"
  sleep 0.2
done

# Les 10 premières devraient réussir (200)
# Les suivantes devraient échouer (429)
```

### Tester avec différentes IPs

```bash
# Simuler une IP différente (nécessite proxy/header forwarding)
curl -X POST http://localhost:5173 \
  -H "X-Forwarded-For: 1.2.3.4" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "question=Test"
```

## Codes d'état HTTP

- **200 OK** : Requête acceptée et traitée
- **400 Bad Request** : Question invalide (vide, trop longue)
- **429 Too Many Requests** : Rate limit dépassé
- **500 Internal Server Error** : Erreur serveur

## Sécurité

### Protection DDoS basique

Le rate limiting offre une protection de base contre :

- ✅ Spam de questions individuelles
- ✅ Abus par un seul utilisateur
- ✅ Bots simples

Il ne protège **pas** contre :

- ❌ DDoS distribués (multiples IPs)
- ❌ Attaques coordonnées
- ❌ Bots sophistiqués avec rotation d'IP

### Recommandations supplémentaires

Pour une protection complète en production :

1. **CloudFlare** : Protection DDoS gratuite
2. **Fail2Ban** : Bannissement automatique au niveau système
3. **CAPTCHA** : Après X tentatives échouées
4. **WAF** : Web Application Firewall (AWS WAF, CloudFlare, Akamai)

## Production

### Considérations

1. **Logs** : Intégrez avec votre système de logging (Sentry, DataDog, etc.)
2. **Métriques** : Trackez le nombre de blocages pour détecter les attaques
3. **Alertes** : Notification si trop d'IPs sont bloquées simultanément
4. **Ajustements** : Adaptez les limites selon votre usage réel

### Monitoring recommandé

```typescript
// Exemple : alerte si trop d'IPs bloquées
setInterval(() => {
  const stats = getRateLimitStats();

  if (stats.blockedIPs > 10) {
    console.error('[Security] Alerte: ${stats.blockedIPs} IPs bloquées');
    // Envoyer notification (email, Slack, PagerDuty, etc.)
  }
}, 60 * 1000); // Vérifier chaque minute
```

## FAQ

### Le rate limiting affecte-t-il le cache Redis ?

Non, ce sont deux systèmes indépendants :

- **Rate limiting** : Contrôle la fréquence des requêtes
- **Cache Redis** : Stocke les réponses pour éviter les appels LLM

Une requête peut être bloquée par le rate limiting même si la réponse est en cache.

### Que se passe-t-il en cas de redémarrage ?

Toutes les entrées du rate limiting sont perdues (stockage en mémoire). Tous les utilisateurs repartent avec un compteur à zéro.

### Comment gérer les utilisateurs légitimes bloqués ?

1. **Whitelist leur IP** dans `RATE_LIMIT_WHITELIST`
2. **Déblocage manuel** via `resetRateLimit(ip)`
3. **Augmenter la limite** si trop restrictive

### Le rate limiting fonctionne-t-il en développement ?

Oui, mais vous pouvez whitelister `127.0.0.1` et `::1` pour éviter de vous bloquer.

## Résumé

Le rate limiting offre :

- ✅ **Protection** : Contre le spam et les abus
- ✅ **Simplicité** : Aucune dépendance externe requise
- ✅ **Performance** : Vérification ultra-rapide en mémoire
- ✅ **Personnalisable** : Limites ajustables selon vos besoins
- ✅ **Transparent** : Messages clairs pour les utilisateurs

Pour toute question ou problème, consultez les logs de l'application.
