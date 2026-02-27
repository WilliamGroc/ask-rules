# Guide de la Détection d'Intention et Questions Overview

## 📋 Vue d'ensemble

Le système intègre maintenant une **détection d'intention** qui adapte automatiquement la stratégie de récupération et le format du contexte selon le type de question posée.

### Types d'intention détectés

1. **Overview** : Questions générales demandant un résumé ou une vue d'ensemble
2. **Specific** : Questions précises sur une règle ou un mécanisme particulier

## 🎯 Cas d'usage

### Questions Overview (Résumé / Vue d'ensemble)

Ces questions déclenchent une stratégie optimisée pour fournir une vue complète du jeu :

**Exemples de questions :**
- "Fais-moi un résumé du jeu"
- "Explique-moi comment jouer"
- "Comment ça se joue ?"
- "Explique-moi dans les grandes lignes"
- "C'est quoi le principe du jeu ?"
- "Comment on gagne ?"
- "Quel est le but du jeu ?"
- "Présente-moi le jeu"
- "Donne-moi un aperçu"

**Optimisations appliquées :**
1. ✅ **Plus de sections récupérées** : 8 sections au lieu de 4
2. ✅ **Priorisation des sections clés** : 
   - Présentation
   - But du jeu
   - Tour de jeu
   - Victoire
   - Préparation
   - Matériel
3. ✅ **Boost de score** : +15% pour les sections prioritaires
4. ✅ **Format de contexte optimisé** : Utilise les résumés extractifs et organise par type de section
5. ✅ **Structure enrichie** : Métadonnées du jeu (joueurs, âge, durée) en en-tête

### Questions Specific (Règles précises)

Ces questions utilisent la recherche standard pour trouver les sections les plus pertinentes :

**Exemples de questions :**
- "Que se passe-t-il si je pioche une carte rouge ?"
- "Puis-je déplacer deux pions en même temps ?"
- "Combien de cartes dois-je piocher ?"
- "Quand faut-il défausser ?"
- "Comment fonctionne l'attaque ?"

**Optimisations appliquées :**
1. ✅ **Recherche ciblée** : 4 sections les plus pertinentes
2. ✅ **Hybrid search** : Combine embedding dense + recherche textuelle BM25
3. ✅ **Contexte enrichi** : Inclut hiérarchie, entités NLP, actions, mécaniques

## 🔧 Architecture

### 1. Module `intentDetector.ts`

Analyse la question pour déterminer son intention.

```typescript
import { detectIntent } from '../modules/intentDetector';

const intent = detectIntent("Fais-moi un résumé du jeu");
// {
//   intent: 'overview',
//   confidence: 0.8,
//   prioritySections: ['presentation', 'but_du_jeu', ...],
//   recommendedSections: 8
// }
```

**Patterns de détection :**
- Mots-clés overview : résumé, vue d'ensemble, comment joue, explique-moi, principe, etc.
- Mots-clés specific : que se passe, si je, puis-je, combien, quand, où, etc.
- Questions courtes (<8 mots) sans indicateurs spécifiques → tendance overview

### 2. Fonction `retrieveForOverview()` dans `retriever.ts`

Stratégie de récupération optimisée pour les questions overview :

```typescript
const selection = await retrieveForOverview(
  question,
  gameId,           // optionnel
  prioritySections, // types de sections à prioriser
  topN              // nombre de sections (8 par défaut)
);
```

**Fonctionnement :**
1. Détecte le jeu ciblé (auto ou spécifié)
2. Récupère 2× plus de sections que demandé
3. Applique un boost de +15% aux sections prioritaires
4. Retrie et limite au nombre demandé

### 3. Format `overview` dans `contextBuilder.ts`

Format de contexte spécialement conçu pour les questions générales :

```typescript
const context = buildContext(sections, gameName, {
  format: 'overview',
  gameMetadata: metadata
});
```

**Caractéristiques :**
- 📖 Organisation par type de section (présentation, but, tour, victoire...)
- 🎯 Utilise les résumés extractifs prioritairement
- 📊 Métadonnées du jeu en en-tête (joueurs, âge, durée)
- 🔹 Affiche les entités et mécaniques clés
- 📄 Structure visuelle claire avec émojis et séparateurs

### 4. Intégration dans `+page.server.ts`

Flux de traitement adaptatif :

```typescript
// 1. Détection d'intention
const intent = detectIntent(question);
const isOverview = intent.intent === 'overview';

// 2. Récupération adaptée
if (isOverview) {
  selection = await retrieveForOverview(
    question,
    gameId,
    intent.prioritySections,
    intent.recommendedSections
  );
} else {
  selection = await retrieveForGame(question, gameName, topN);
}

// 3. Construction du contexte adapté
const contextFormat = isOverview ? 'overview' : 'enriched';
const context = buildContext(sections, gameName, {
  format: contextFormat,
  gameMetadata
});

// 4. Appel LLM avec le contexte optimisé
const llm = await queryLLM(question, context);
```

## 📊 Exemple de contexte Overview

```
═════════════════════════════════════════════════════════════════════════
  VUE D'ENSEMBLE — 7 WONDERS
═════════════════════════════════════════════════════════════════════════

👥 2–7 joueurs • 🎂 10+ • ⏱️  30 min

─────────────────────────────────────────────────────────────────────────

📖 PRÉSENTATION

▸ Introduction
  p.2

  7 Wonders est un jeu de développement de civilisation où chaque joueur
  construit sa cité en 3 âges pour marquer le plus de points de victoire.

  🔹 Éléments clés : civilisation, cité, merveille, points, victoire

🎯 BUT DU JEU

▸ Objectif du jeu
  p.3

  Le but est de développer sa civilisation et marquer le maximum de points
  de victoire via les bâtiments, les merveilles et le développement militaire.

  ⚙️  Mécaniques : draft_cartes, points_victoire

🔄 TOUR DE JEU

▸ Déroulement d'un tour
  p.5–6

  À chaque tour, choisir une carte, la jouer, puis passer sa main au voisin.
  Répéter jusqu'à ce qu'il ne reste plus de cartes.

  🔹 Éléments clés : carte, main, tour, passer, jouer
  ⚙️  Mécaniques : draft_cartes

[...]
```

## 🚀 Avantages

### Pour les questions Overview

1. **Couverture complète** : 8 sections couvrent tous les aspects clés du jeu
2. **Pertinence améliorée** : Priorisation intelligente des sections structurantes
3. **Lisibilité optimale** : Organisation logique par type de section
4. **Résumés prioritaires** : Moins verbeux, plus synthétique
5. **Métadonnées contextuelles** : Informations pratiques (joueurs, durée...)

### Pour les questions Specific

1. **Précision** : Cible les 4 sections les plus pertinentes
2. **Détail complet** : Contenu intégral avec toutes les métadonnées
3. **Recherche hybride** : Combine similarité sémantique et recherche textuelle

## 📈 Résultats attendus

### Avant (recherche standard)
- Question : "Fais-moi un résumé du jeu"
- **Problème** : Récupère 4 sections basées sur l'embedding de la question
- **Résultat** : Réponse partielle, peut manquer des sections clés

### Après (détection d'intention)
- Question : "Fais-moi un résumé du jeu"
- **Solution** : Détecte intent=overview, récupère 8 sections avec boost
- **Résultat** : Vue d'ensemble complète et structurée

## 🔍 Patterns de détection

### Overview patterns (15 patterns)
```regex
résumé|vue d'ensemble|comment joue|explique-moi|c'est quoi|
principe du jeu|fonctionne le jeu|grandes lignes|base|
présentation|introduction|général|aperçu|comment gagne|
but du jeu|objectif
```

### Specific patterns (10 patterns)
```regex
que se passe|si je|si on|puis-je|peut-on|est-ce que|
combien de|quand|où|pourquoi|comment [^joue]
```

## 💡 Conseils d'utilisation

### Pour les développeurs

1. **Ajuster les seuils** : Modifier `minConfidence` dans `isOverviewQuestion()` si besoin
2. **Ajouter des patterns** : Étendre les listes de patterns dans `intentDetector.ts`
3. **Personnaliser les sections** : Adapter `prioritySections` selon le domaine
4. **Optimiser le boost** : Ajuster `PRIORITY_BOOST` dans `retrieveForOverview()`

### Pour les utilisateurs

1. **Questions générales** : Utiliser des formulations naturelles ("explique-moi", "résume")
2. **Questions précises** : Être spécifique ("que se passe si...", "combien de...")
3. **Nommer le jeu** : Mentionner le nom du jeu pour cibler directement

## 🧪 Tests suggérés

```bash
# Questions Overview
curl -X POST /api/ask -d "question=Fais-moi un résumé de 7 Wonders"
curl -X POST /api/ask -d "question=Comment se joue Wingspan ?"
curl -X POST /api/ask -d "question=Explique-moi Azul dans les grandes lignes"

# Questions Specific
curl -X POST /api/ask -d "question=Combien de cartes dois-je piocher dans 7 Wonders ?"
curl -X POST /api/ask -d "question=Que se passe-t-il si j'ai 2 oiseaux roses dans Wingspan ?"
```

## 📝 Prochaines améliorations possibles

1. **ML-based intent detection** : Entraîner un modèle de classification sur des exemples réels
2. **Intent hybride** : Détecter des questions mixtes (overview + specific)
3. **Contexte adaptatif** : Ajuster dynamiquement le nombre de sections selon la complexité
4. **Feedback utilisateur** : Permettre de signaler si la réponse était trop générale ou trop précise
5. **A/B testing** : Comparer les résultats avec et sans détection d'intention
