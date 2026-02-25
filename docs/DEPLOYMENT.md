# Guide de Déploiement - Ask Rules

Ce guide couvre le déploiement complet de l'application Ask Rules avec toutes ses fonctionnalités (Admin, SEO, PWA).

## 📋 Checklist Pré-Déploiement

### 1. Assets et Médias

- [x] Icônes SVG créées (favicon, icons, apple-touch-icon, og-image)
- [ ] Optionnel : Convertir les SVG en PNG pour compatibilité maximale

  ```bash
  # Si sharp est installé
  node scripts/convert-assets.js

  # Ou utiliser ImageMagick
  ./scripts/create-icons.sh
  ```

### 2. Variables d'Environnement

Créer un fichier `.env` en production avec :

```bash
# Base de données PostgreSQL avec pgvector
DATABASE_URL=postgresql://user:password@host:port/database

# Mot de passe admin (changez-le !)
ADMIN_PASSWORD=votre_mot_de_passe_securise

# URL publique de l'application (pour SEO/PWA)
PUBLIC_APP_URL=https://votre-domaine.com

# Clés API pour embeddings et LLM
OPENAI_API_KEY=sk-...
# ou
VOYAGE_API_KEY=...
```

**⚠️ IMPORTANT** : Ne jamais commiter le fichier `.env` !

### 3. Build de Production

```bash
# Installer les dépendances
pnpm install

# Vérifier qu'il n'y a pas d'erreurs
pnpm check

# Build pour la production
pnpm build
```

Cela génère :

- `/build` - Application SvelteKit optimisée
- `/build/client` - Assets statiques avec cache versioning
- `/build/server` - Code serveur SSR

### 4. Test Local du Build

```bash
# Tester le build en local
node build/index.js

# Ou avec variables d'environnement
DATABASE_URL=... ADMIN_PASSWORD=... node build/index.js
```

Visiter `http://localhost:3000` et vérifier :

- ✅ Page d'accueil fonctionne
- ✅ Import de fichiers fonctionne
- ✅ Recherche fonctionne
- ✅ Admin login (`/admin/login`)
- ✅ PWA installable (icône dans la barre d'adresse)
- ✅ Service Worker enregistré (DevTools → Application)

## 🚀 Options de Déploiement

### Option 1 : Vercel (Recommandé pour SvelteKit)

**Avantages** :

- ✅ Déploiement automatique depuis Git
- ✅ HTTPS automatique
- ✅ CDN global
- ✅ Variables d'environnement sécurisées
- ✅ Gratuit pour petits projets

**Instructions** :

1. Installer Vercel CLI :

   ```bash
   pnpm add -g vercel
   ```

2. Déployer :

   ```bash
   vercel
   ```

3. Ajouter les variables d'environnement :
   - Aller sur vercel.com
   - Project → Settings → Environment Variables
   - Ajouter : `DATABASE_URL`, `ADMIN_PASSWORD`, `PUBLIC_APP_URL`

4. Redéployer :
   ```bash
   vercel --prod
   ```

**Configuration PostgreSQL** :

- Utiliser Vercel Postgres (intégré)
- Ou Supabase (gratuit jusqu'à 500 MB)
- Ou Neon (serverless Postgres gratuit)

### Option 2 : Docker + VPS

**Avantages** :

- ✅ Contrôle total
- ✅ Base de données locale possible
- ✅ Pas de vendor lock-in

**Dockerfile** (déjà présent) :

```bash
# Build l'image
docker build -t ask-rules .

# Lancer le container
docker run -p 3000:3000 \
  -e DATABASE_URL=... \
  -e ADMIN_PASSWORD=... \
  -e PUBLIC_APP_URL=... \
  ask-rules
```

**Docker Compose** (avec PostgreSQL) :

Créer `docker-compose.yml` :

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgresql://postgres:password@db:5432/ask_rules
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      PUBLIC_APP_URL: ${PUBLIC_APP_URL}
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: ankane/pgvector:latest
    environment:
      POSTGRES_DB: ask_rules
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

Lancer :

```bash
docker-compose up -d
```

**Nginx Reverse Proxy** (pour HTTPS) :

```nginx
server {
    listen 80;
    server_name votre-domaine.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name votre-domaine.com;

    ssl_certificate /etc/letsencrypt/live/votre-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votre-domaine.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option 3 : Autres Plateformes

**Netlify** :

- Supporte SvelteKit via adapter-netlify
- Modifier `svelte.config.js` pour utiliser @sveltejs/adapter-netlify

**Railway** :

- Détecte automatiquement Node.js
- PostgreSQL inclus gratuit
- `railway up`

**Render** :

- PostgreSQL gratuit (90 jours)
- Build: `pnpm install && pnpm build`
- Start: `node build/index.js`

**Fly.io** :

- `fly launch`
- PostgreSQL intégré
- Edge deployment

## 🔒 Sécurité en Production

### 1. Variables d'Environnement

```bash
# NE JAMAIS utiliser les valeurs par défaut en production !
ADMIN_PASSWORD=un_mot_de_passe_tres_long_et_securise_123456!@#

# Générer un mot de passe aléatoire
openssl rand -base64 32
```

### 2. Base de Données

```sql
-- Créer un utilisateur dédié (pas postgres superuser)
CREATE USER app_user WITH PASSWORD 'mot_de_passe_securise';
GRANT CONNECT ON DATABASE ask_rules TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

### 3. Cookies Sécurisés

Le code utilise déjà `secure: true` en production :

```typescript
// src/routes/admin/login/+page.server.ts
cookies.set('admin_auth', 'true', {
  path: '/admin',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // ✅
  sameSite: 'strict',
  maxAge: 60 * 60 * 24, // 24h
});
```

### 4. Headers de Sécurité

Dans `svelte.config.js`, ajouter :

```javascript
kit: {
  // ... existing config
  headers: {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  }
}
```

## 🔍 SEO Post-Déploiement

### 1. Google Search Console

1. Aller sur https://search.google.com/search-console
2. Ajouter votre propriété (domaine ou URL)
3. Vérifier la propriété (DNS ou HTML tag)
4. Soumettre le sitemap : `https://votre-domaine.com/sitemap.xml`

### 2. Tester le SEO

**Google Rich Results Test** :

- https://search.google.com/test/rich-results
- Tester votre page d'accueil
- Vérifier que le JSON-LD est détecté

**Facebook Debugger** :

- https://developers.facebook.com/tools/debug/
- Tester les tags Open Graph
- Forcer le re-scrape si nécessaire

**Twitter Card Validator** :

- https://cards-dev.twitter.com/validator
- Vérifier que l'aperçu s'affiche correctement

### 3. Lighthouse Audit

```bash
# Localement
pnpm add -g @lhci/cli
lhci autorun --url=https://votre-domaine.com

# Ou dans Chrome DevTools
# F12 → Lighthouse → Analyze page load
```

**Scores cibles** :

- Performance : 90+ ✅
- Accessibility : 95+ ✅
- Best Practices : 95+ ✅
- SEO : 100 ✅
- PWA : 90+ ✅

## 📱 PWA Post-Déploiement

### 1. Vérifier l'Installation

**Desktop (Chrome/Edge)** :

- Icône + dans la barre d'adresse
- Menu → Installer Ask Rules

**Mobile (Android)** :

- Menu → Ajouter à l'écran d'accueil
- Banner d'installation automatique

**Mobile (iOS)** :

- Safari → Partager → Ajouter à l'écran d'accueil
- Icône personnalisée visible

### 2. Tester le Mode Hors Ligne

1. Ouvrir l'app
2. Chrome DevTools → Network → Offline
3. Rafraîchir la page
4. Devrait afficher "Mode hors ligne" au lieu d'une erreur

### 3. Service Worker Update

Quand vous modifiez le service worker :

```javascript
// static/service-worker.js
const CACHE_NAME = 'ask-rules-v2'; // Incrémenter la version
```

Les utilisateurs recevront une notification pour rafraîchir l'app.

## 🔄 Mises à Jour et Maintenance

### Workflow Git

```bash
# Développer sur une branche
git checkout -b feature/nouvelle-fonctionnalite

# Faire vos modifications
git add .
git commit -m "feat: ajouter nouvelle fonctionnalité"

# Pousser vers GitHub
git push origin feature/nouvelle-fonctionnalite

# Créer une Pull Request sur GitHub
# Après merge, automatic deploy sur Vercel/Railway/etc.
```

### Migrations Base de Données

Si vous modifiez le schéma :

```bash
# Créer un script de migration
node scripts/migrate-v2.js
```

Exemple de migration :

```typescript
// scripts/migrate-v2.ts
import { pool } from '../src/modules/db.js';

async function migrate() {
  await pool.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS author TEXT');
  console.log('✅ Migration v2 terminée');
}

migrate();
```

### Monitoring

**Logs** :

```bash
# Vercel
vercel logs

# Docker
docker logs ask-rules -f

# PM2
pm2 logs ask-rules
```

**Erreurs** :

- Surveiller les erreurs 500 dans les logs
- Vérifier la connexion base de données
- Vérifier l'espace disque (uploads/)

## 📊 Analytics (Optionnel)

### Google Analytics 4

Dans [src/app.html](src/app.html), ajouter :

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Plausible (Alternative Privacy-Friendly)

```html
<script defer data-domain="votre-domaine.com" src="https://plausible.io/js/script.js"></script>
```

## ✅ Checklist Finale

Avant de mettre en production :

- [ ] `.env` configuré avec vraies valeurs
- [ ] `ADMIN_PASSWORD` sécurisé (pas le défaut "admin")
- [ ] Base de données PostgreSQL avec pgvector opérationnelle
- [ ] `pnpm build` réussit sans erreurs
- [ ] Test du build local fonctionne
- [ ] HTTPS configuré (obligatoire pour PWA)
- [ ] Domaine configuré (`PUBLIC_APP_URL`)
- [ ] Icônes créées et visibles
- [ ] Service Worker s'enregistre (DevTools → Application)
- [ ] Admin accessible et login fonctionne
- [ ] Import de fichiers fonctionne
- [ ] Recherche RAG fonctionne
- [ ] Sitemap accessible (`/sitemap.xml`)
- [ ] robots.txt accessible
- [ ] Open Graph tags visibles (Facebook Debugger)
- [ ] PWA installable (Desktop + Mobile)
- [ ] Mode hors ligne fonctionne
- [ ] Lighthouse score > 90 sur toutes catégories

## 🆘 Troubleshooting

### Service Worker ne se charge pas

```bash
# Vérifier la console navigateur
# Erreurs communes :
# - Chemin /service-worker.js incorrect
# - HTTPS requis en production
# - Cache browser à vider

# Solution :
# 1. Vider le cache : DevTools → Application → Clear storage
# 2. Vérifier HTTPS est actif
# 3. Vérifier /service-worker.js accessible
```

### PWA non installable

```bash
# Checklist :
# 1. HTTPS actif ✓
# 2. manifest.json accessible ✓
# 3. Service Worker enregistré ✓
# 4. Icons présentes ✓
# 5. start_url valide ✓

# Chrome conditions :
# - Au moins 2 visites séparées de 5 minutes
# - Utilisateur doit interagir (clic)
```

### Erreurs Base de Données

```bash
# Vérifier connexion
psql $DATABASE_URL -c "SELECT 1"

# Vérifier pgvector installé
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'vector'"

# Recréer les tables si nécessaire
node src/migrate.ts
```

### Images Open Graph ne s'affichent pas

```bash
# 1. Vérifier og-image accessible
curl https://votre-domaine.com/og-image.svg

# 2. Forcer re-scrape Facebook
# https://developers.facebook.com/tools/debug/
# Cliquer "Scrape Again"

# 3. Twitter cache : attendre 7 jours ou contacter support
```

## 📚 Documentation

- [PWA_GUIDE.md](./PWA_GUIDE.md) - Guide complet PWA
- [SEO_GUIDE.md](./SEO_GUIDE.md) - Guide SEO et référencement
- [ASSETS_GUIDE.md](./ASSETS_GUIDE.md) - Gestion des icônes et images
- [FILE_STORAGE_GUIDE.md](./FILE_STORAGE_GUIDE.md) - Système de fichiers
- [HYBRID_SEARCH_GUIDE.md](./HYBRID_SEARCH_GUIDE.md) - Recherche hybride

## 🎉 Félicitations !

Votre application Ask Rules est maintenant :

- ✅ Sécurisée (authentification admin)
- ✅ Optimisée SEO (Open Graph, Schema.org, sitemap)
- ✅ Installable (PWA complète)
- ✅ Hors ligne (Service Worker)
- ✅ Production-ready

Bon déploiement ! 🚀
