# Build et Test Docker avec Préchargement du Modèle

Ce document explique comment le Dockerfile précharge les modèles d'embeddings.

## 🎯 Objectif

Télécharger les modèles d'embeddings **pendant le build Docker** au lieu du premier lancement en production, pour :

- ✅ Réduire le temps de démarrage initial
- ✅ Éviter les timeouts lors du premier import
- ✅ Fonctionner sans connexion internet en production
- ✅ Rendre le déploiement plus prévisible

## 📦 Modèles Préchargés

Le script [scripts/preload-model.mjs](../scripts/preload-model.mjs) télécharge :

1. **Xenova/multilingual-e5-small** (principal)
   - 384 dimensions
   - ~120 MB
   - Multilingue optimisé

2. **Xenova/paraphrase-multilingual-MiniLM-L12-v2** (fallback)
   - 384 dimensions
   - ~50 MB
   - Utilisé si le principal échoue

## 🏗️ Build Docker

```bash
# Build normal (précharge les modèles)
docker build -t ask-rules .

# Pendant le build, vous verrez :
# [preload] Téléchargement de Xenova/multilingual-e5-small...
# [preload] ✅ multilingual-e5-small prêt (45.2s)
# [preload] ✨ Préchargement terminé !
```

## ⚡ Tester le Préchargement en Local

Vous pouvez tester le script avant le build :

```bash
# Télécharger dans ~/.cache (défaut local)
node scripts/preload-model.mjs

# Ou spécifier un dossier custom
XDG_CACHE_HOME=/tmp/hf-test node scripts/preload-model.mjs
```

## 🐳 Structure du Dockerfile

```dockerfile
# Stage 2 : Build
FROM deps AS builder
COPY . .
RUN pnpm run build:web

# Configure le cache
ENV XDG_CACHE_HOME=/hf-cache

# ⭐ Précharge les modèles (nouveau)
COPY scripts/preload-model.mjs ./scripts/
RUN node scripts/preload-model.mjs

# Stage 3 : Runtime
FROM node:24-slim AS runtime
# ...
# ⭐ Copie le cache préchargé
COPY --from=builder /hf-cache /hf-cache
```

## 📊 Gain de Performance

### Avant (sans préchargement)

```
docker run ask-rules
→ Démarre l'app (1s)
→ Premier import de fichier
→ Télécharge le modèle (30-60s) ⚠️
→ Import commence
```

### Après (avec préchargement)

```
docker run ask-rules
→ Démarre l'app (1s)
→ Premier import de fichier
→ Modèle déjà en cache ✅
→ Import commence immédiatement
```

**Gain** : 30-60 secondes sur le premier démarrage !

## 🔍 Vérifier le Cache dans l'Image

```bash
# Lancer un conteneur temporaire
docker run --rm -it ask-rules sh

# Lister le cache
ls -lh /hf-cache/models/

# Devrait montrer :
# Xenova/
#   ├── multilingual-e5-small/
#   │   ├── onnx/
#   │   ├── tokenizer.json
#   │   └── ...
```

## 🛠️ Personnaliser le Préchargement

### Changer le modèle

Éditez [scripts/preload-model.mjs](../scripts/preload-model.mjs) :

```javascript
// Ligne 14-17
const PRIMARY_MODEL = 'Xenova/votre-modele';
const FALLBACK_MODEL = 'Xenova/autre-modele';
```

### Ajouter d'autres modèles

```javascript
// À la fin de main()
await preloadModel('Xenova/autre-modele-utile', { quantized: true });
```

### Désactiver le fallback

Commentez les lignes 36-39 dans [scripts/preload-model.mjs](../scripts/preload-model.mjs).

## 🚨 Troubleshooting

### Le build échoue au préchargement

```bash
# Erreur réseau : réessayer
docker build -t ask-rules .

# Ou builder sans cache pour forcer un re-téléchargement
docker build --no-cache -t ask-rules .
```

### Le modèle n'est pas trouvé au runtime

```bash
# Vérifier que XDG_CACHE_HOME est bien défini
docker run ask-rules env | grep XDG

# Devrait afficher : XDG_CACHE_HOME=/hf-cache
```

### Le build est trop long

Le téléchargement du modèle prend 30-60s selon votre connexion. C'est **normal et fait 1 seule fois**.

Les builds suivants réutilisent le cache Docker si `scripts/preload-model.mjs` n'a pas changé.

## 📈 Optimisations Avancées

### Multi-stage cache

```dockerfile
# Créer un stage dédié au cache
FROM node:24-slim AS model-cache
ENV XDG_CACHE_HOME=/hf-cache
COPY --from=deps /app/node_modules ./node_modules
COPY scripts/preload-model.mjs ./
RUN node preload-model.mjs

# Puis le réutiliser
FROM runtime
COPY --from=model-cache /hf-cache /hf-cache
```

### Cache externe (Docker BuildKit)

```dockerfile
# Utiliser un mount cache (persiste entre builds)
RUN --mount=type=cache,target=/hf-cache \
    node scripts/preload-model.mjs
```

```bash
# Build avec BuildKit
DOCKER_BUILDKIT=1 docker build -t ask-rules .
```

## ✅ Checklist Production

- [x] Script preload-model.mjs créé
- [x] Dockerfile copie et exécute le script
- [x] Cache /hf-cache copié vers runtime stage
- [x] ENV XDG_CACHE_HOME défini en runtime
- [ ] Tester le build : `docker build -t ask-rules .`
- [ ] Vérifier les logs : voir "✅ multilingual-e5-small prêt"
- [ ] Tester le run : `docker run -p 3000:3000 -e DATABASE_URL=... ask-rules`
- [ ] Vérifier que l'import fonctionne sans téléchargement

## 🎉 Résultat

Votre application Docker :

- ✅ Se lance plus vite
- ✅ Fonctionne offline
- ✅ Est plus stable et prévisible
- ✅ Optimisée pour la production

Les modèles d'embeddings sont maintenant intégrés à l'image Docker !
