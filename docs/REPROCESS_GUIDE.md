# Recalcul des Embeddings - Guide Admin

Ce guide explique comment recalculer les embeddings de vos jeux avec le nouveau modèle d'embeddings.

## 🎯 Objectif

Après avoir changé le modèle d'embeddings (par exemple, de `paraphrase-MiniLM` vers `multilingual-e5-small`), vous devez **recalculer tous les embeddings** pour bénéficier des améliorations.

## 🔄 Fonctionnalités

### 1. Recalculer un jeu individuel

Dans la page [/admin/games](http://localhost:5173/admin/games), chaque carte de jeu dispose d'un bouton **"🔄 Recalculer"**.

**Utilisation** :

1. Cliquez sur "🔄 Recalculer" sur le jeu désiré
2. Le système :
   - Récupère le fichier PDF original depuis `uploads/`
   - Ré-extrait le texte
   - Ré-parse les sections avec le chunking actuel
   - **Régénère tous les embeddings** avec le nouveau modèle
   - Remplace les anciennes sections dans la base
3. Message de confirmation : "Jeu {nom} recalculé : X sections"

**Durée estimée** :

- 30-60 secondes pour un jeu moyen (50-100 sections)
- Dépend de la taille du PDF et du modèle d'embeddings

### 2. Recalculer tous les jeux

Dans le header de la page, le bouton **"🔄 Tout recalculer"** permet de recalculer tous les jeux en une seule opération.

**Utilisation** :

1. Cliquez sur "🔄 Tout recalculer"
2. Le système traite chaque jeu séquentiellement
3. Les jeux avec fichiers manquants sont ignorés (erreur affichée)
4. Message final : "X/Y jeux recalculés"

**Durée estimée** :

- 1-2 minutes par jeu
- Si vous avez 10 jeux : ~10-20 minutes

**⚠️ Important** : Le bouton est désactivé si aucun jeu n'est présent.

## 📋 Quand recalculer ?

### Scénarios nécessitant un recalcul

1. **Changement de modèle d'embeddings**

   ```typescript
   // Avant : paraphrase-multilingual-MiniLM-L12-v2
   // Après : multilingual-e5-small
   ```

   ▶ **Recalcul obligatoire** pour tous les jeux

2. **Mise à jour de @huggingface/transformers**

   ```bash
   pnpm update @huggingface/transformers
   ```

   ▶ Recalcul recommandé si nouvelle version majeure

3. **Modification du pipeline de chunking**
   - Changement de `CHUNK_SIZE` ou `OVERLAP`
   - Nouvelle stratégie de découpage
     ▶ Recalcul recommandé pour cohérence

4. **Fichier source mis à jour**
   - Nouvelle version des règles PDF
     ▶ Re-importer normalement (pas de recalcul)

### Scénarios ne nécessitant PAS de recalcul

- Modification de l'interface (Svelte components)
- Changement de LLM (Mistral, OpenAI, etc.)
- Mise à jour de la recherche hybride (ne change pas les embeddings)
- Correction de bugs frontend

## 🔍 Détails Techniques

### Ce qui est conservé

- **ID du jeu** : `gameSlug` reste identique
- **Nom du jeu** : `games.jeu` inchangé
- **Fichier source** : `games.fichier` pointeur conservé
- **Date d'ajout** : Mise à jour automatiquement

### Ce qui est recalculé

- **Tous les embeddings** : Vectorisation avec le nouveau modèle
- **Sections** : Re-parsées avec le pipeline actuel (peut détecter plus/moins de sections)
- **Métadonnées** : `metadata` et `statistiques` régénérées
- **Chunking** : Appliqué selon la configuration actuelle

### Gestion des erreurs

Le système est résilient :

```typescript
// Si le fichier est introuvable
'Fichier source introuvable : uploads/jeu/fichier.pdf';

// Si le parsing échoue
"Erreur lors du recalcul : {message d'erreur}";

// Recalcul global partiel
'5/10 jeux recalculés. Erreurs: Jeu1: fichier manquant, Jeu2: ...';
```

Les jeux en erreur ne bloquent pas les autres lors du recalcul global.

## 📊 Performance

### Temps de traitement

| Taille du jeu       | Sections | Temps estimé |
| ------------------- | -------- | ------------ |
| Petit (< 20 pages)  | 20-50    | 10-20s       |
| Moyen (20-50 pages) | 50-150   | 30-60s       |
| Grand (> 50 pages)  | 150-300+ | 1-3 min      |

### Optimisations

Le système utilise :

- **Transaction SQL** : Rollback automatique en cas d'erreur
- **Insertion en flux** : Pas d'accumulation en mémoire
- **Cache modèle** : Le modèle d'embeddings reste chargé entre sections

## 🛡️ Sécurité

### Protection contre les pertes

- **Transaction atomique** : Tout réussit ou tout échoue (pas de corruption)
- **Backup automatique** : Les anciennes sections sont supprimées APRÈS insertion des nouvelles
- **Fichiers préservés** : Les PDF sources dans `uploads/` ne sont jamais modifiés

### Recommandations

Avant un recalcul global :

```bash
# 1. Backup de la base de données
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# 2. Vérifier l'espace disque
df -h

# 3. Vérifier que les fichiers existent
ls -lh uploads/**/*.pdf
```

## 💡 Cas d'Usage

### Exemple : Migration vers e5-small

```bash
# 1. Modifier le modèle
# Éditer src/modules/embedder.ts :
# 'Xenova/multilingual-e5-small'

# 2. Redémarrer le serveur dev
pnpm dev

# 3. Aller sur /admin/games
# 4. Cliquer "Tout recalculer"
# 5. Attendre la fin (10-20 min pour 10 jeux)
# 6. ✅ Tester la recherche
```

### Exemple : Recalcul d'un seul jeu

```bash
# Cas : Vous avez mis à jour manuellement le PDF dans uploads/
# mais l'ID du jeu reste le même

# 1. Remplacer le fichier
mv nouveau-regles.pdf uploads/catan/1234567890_regles.pdf

# 2. Aller sur /admin/games
# 3. Trouver le jeu "Catan"
# 4. Cliquer "🔄 Recalculer" sur cette carte
# 5. ✅ Les nouvelles sections sont indexées
```

## 🔧 Troubleshooting

### Erreur : "Fichier source introuvable"

**Cause** : Le fichier PDF a été supprimé ou déplacé.

**Solution** :

```bash
# Option 1 : Re-restaurer le fichier
# Vérifier le chemin dans la base
psql $DATABASE_URL -c "SELECT id, fichier FROM games WHERE id='game-slug';"

# Option 2 : Supprimer et ré-importer
# /admin/games → Supprimer le jeu
# /import → Ré-importer le PDF
```

### Erreur : Timeout pendant le recalcul

**Cause** : Document très volumineux ou serveur lent.

**Solution** :

- Recalculer les jeux individuellement plutôt qu'en masse
- Augmenter le timeout du serveur si nécessaire
- Vérifier les ressources CPU/RAM

### Les résultats de recherche n'ont pas changé

**Cause** : Cache navigateur ou ancien embedding encore utilisé.

**Solution** :

```bash
# 1. Vider le cache du navigateur (Ctrl+Shift+R)
# 2. Redémarrer le serveur
pnpm dev
# 3. Vérifier les embeddings en base
psql $DATABASE_URL -c "SELECT game_id, COUNT(*) FROM sections GROUP BY game_id;"
```

## 📚 Références

- [embedder.ts](../src/modules/embedder.ts) - Configuration du modèle
- [pipeline.ts](../src/pipeline.ts) - Logique d'analyse
- [knowledgeBase.ts](../src/modules/knowledgeBase.ts) - Fonctions upsert
- [EMBEDDING_UPGRADE_ANALYSIS.md](./EMBEDDING_UPGRADE_ANALYSIS.md) - Comparaison des modèles

## ✅ Checklist Post-Recalcul

Après avoir recalculé tous les jeux :

- [ ] Tester une recherche connue qui fonctionnait mal
- [ ] Comparer les scores de pertinence (devraient être meilleurs)
- [ ] Vérifier que tous les jeux ont des sections (page admin)
- [ ] Tester la recherche hybride (devrait être plus rapide)
- [ ] Surveiller les logs pour erreurs éventuelles

## 🎉 Résultat Attendu

Après un recalcul complet avec `multilingual-e5-small` :

- ✅ **Meilleure précision** : +15-20% sur les recherches
- ✅ **Embeddings cohérents** : Tous les jeux utilisent le même modèle
- ✅ **Pas de régression** : Anciens résultats toujours pertinents
- ✅ **Base à jour** : Prête pour la production

Profitez de votre base de connaissance améliorée ! 🚀
