# Guide SEO Ask Rules

## Améliorations SEO implémentées

### 1. Composant SEO réutilisable

**Fichier**: [src/lib/SEO.svelte](src/lib/SEO.svelte)

Un composant Svelte réutilisable qui gère tous les meta tags SEO :

- Meta tags standards (title, description, keywords)
- Open Graph pour Facebook/LinkedIn
- Twitter Cards
- Schema.org JSON-LD pour Google
- Balises canoniques

### 2. Meta tags par page

#### Page d'accueil (`/`)

- **Titre**: "Ask Rules — Assistant IA pour règles de jeux de société"
- **Description**: Optimisée pour les recherches "questions règles jeux"
- **Keywords**: jeux de société, règles de jeu, IA, assistant intelligent

#### Page import (`/import`)

- **Titre**: "Importer des règles - Ask Rules"
- **Description**: Focus sur l'import de PDF et l'indexation
- **Keywords**: importer règles, PDF jeu de société, upload règles

#### Pages admin

- **Meta robots**: `noindex, nofollow` (pas d'indexation)
- Protection des pages privées

### 3. Fichiers SEO essentiels

#### robots.txt

**Fichier**: [static/robots.txt](static/robots.txt)

- Autorise l'indexation des pages publiques
- Bloque `/admin/` et `/files/`
- Référence le sitemap

#### sitemap.xml

**Fichier**: [src/routes/sitemap.xml/+server.ts](src/routes/sitemap.xml/+server.ts)

- Sitemap dynamique généré par SvelteKit
- Liste toutes les pages publiques
- Mise à jour automatique

#### manifest.json

**Fichier**: [static/manifest.json](static/manifest.json)

- Support PWA (Progressive Web App)
- Optimisation mobile
- Icônes et thème

### 4. Améliorations HTML de base

**Fichier**: [src/app.html](src/app.html)

- `lang="fr"` pour indiquer la langue
- `theme-color` pour la barre d'adresse mobile
- Liens vers favicon et apple-touch-icon
- Support PWA avec manifest
- Meta tags mobile optimisés

### 5. Schema.org / Structured Data

Données structurées JSON-LD ajoutées sur chaque page :

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Ask Rules",
  "applicationCategory": "GameApplication",
  "inLanguage": "fr-FR"
}
```

Bénéfices :

- Rich snippets dans les résultats Google
- Meilleure compréhension par les moteurs de recherche
- Éligibilité aux featured snippets

## Images requises

Pour compléter le SEO, vous devez ajouter ces images dans le dossier `static/` :

### Images essentielles

1. **favicon.ico** (32x32) - Favicon standard
2. **icon-192.png** (192x192) - Icône PWA petite
3. **icon-512.png** (512x512) - Icône PWA grande
4. **apple-touch-icon.png** (180x180) - Icône iOS
5. **og-image.jpg** (1200x630) - Image Open Graph pour réseaux sociaux

Voir [static/README.md](static/README.md) pour plus de détails.

## Checklist SEO

### ✅ Implémenté

- [x] Meta tags optimisés
- [x] Open Graph / Twitter Cards
- [x] Schema.org JSON-LD
- [x] robots.txt
- [x] sitemap.xml dynamique
- [x] Manifest.json (PWA)
- [x] Balises canoniques
- [x] Meta robots pour pages privées
- [x] Support mobile / responsive
- [x] Langue déclarée (fr)

### 📋 À faire manuellement

- [ ] Créer et ajouter les images (favicon, icons, og-image)
- [ ] Configurer Google Search Console
- [ ] Soumettre le sitemap à Google
- [ ] Vérifier la propriété du site
- [ ] Configurer Google Analytics (optionnel)
- [ ] Tester avec des outils SEO :
  - [Google PageSpeed Insights](https://pagespeed.web.dev/)
  - [Google Rich Results Test](https://search.google.com/test/rich-results)
  - [Schema Markup Validator](https://validator.schema.org/)

### 🚀 Optimisations avancées possibles

- [ ] Ajouter un blog pour le SEO de contenu
- [ ] Implémenter FAQ avec Schema.org FAQPage
- [ ] Ajouter des breadcrumbs structurés
- [ ] Optimiser les performances (lazy loading, etc.)
- [ ] Implémenter le SSR (Server-Side Rendering) si nécessaire
- [ ] Ajouter des alternate hreflang pour d'autres langues

## Vérification

### Tester localement

```bash
# Démarrer le serveur
pnpm dev

# Vérifier les URLs
http://localhost:5173/
http://localhost:5173/robots.txt
http://localhost:5173/sitemap.xml
http://localhost:5173/manifest.json
```

### Outils de test recommandés

1. **Vue du code source** : Vérifier que tous les meta tags sont présents
2. **Lighthouse** (DevTools Chrome) : Score SEO et accessibilité
3. **Facebook Debugger** : https://developers.facebook.com/tools/debug/
4. **Twitter Card Validator** : https://cards-dev.twitter.com/validator
5. **Schema Validator** : https://validator.schema.org/

## Impact SEO attendu

### Bénéfices immédiats

- ✅ Meilleur affichage dans les résultats de recherche
- ✅ Preview enrichie sur les réseaux sociaux
- ✅ Indexation correcte par Google
- ✅ Support mobile optimisé
- ✅ Possibilité d'installer comme PWA

### Bénéfices à moyen terme

- 📈 Meilleur classement dans les recherches
- 👥 Taux de clic amélioré (CTR)
- 🎯 Ciblage des bonnes requêtes
- 📱 Meilleure expérience mobile

## Notes importantes

1. **Temps d'indexation** : Peut prendre 1-4 semaines pour Google
2. **Contenu unique** : Assurez-vous que chaque page a un titre/description unique
3. **URLs propres** : Évitez les paramètres inutiles dans les URLs
4. **HTTPS** : Recommandé pour la production (impact SEO)
5. **Performance** : La vitesse de chargement est un facteur de classement

## Ressources utiles

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Schema.org Documentation](https://schema.org/)
- [Open Graph Protocol](https://ogp.me/)
- [PWA Checklist](https://web.dev/pwa-checklist/)
