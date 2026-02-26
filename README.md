# Analyseur de Manuel Utilisateur — PoC NLP

Proof of Concept **TypeScript / Node.js** pour analyser des manuels utilisateur
(PDF ou texte), extraire des informations structurées via NLP, et produire un
JSON exploitable par un LLM.

## Architecture

```
analyser-ia/
├── src/
│   ├── analyser.ts               # Point d'entrée — orchestration du pipeline
│   ├── types.ts                  # Interfaces TypeScript partagées
│   └── modules/
│       ├── textExtractor.ts      # Extraction texte depuis .pdf ou .txt
│       ├── sectionParser.ts      # Découpage du texte en sections
│       ├── nlpProcessor.ts       # Analyse NLP (entités, actions, résumé)
│       └── embedder.ts           # (Optionnel) Génération d'embeddings
├── dist/                         # Sortie compilée (tsc)
├── tsconfig.json
└── package.json
```

## Prérequis

- Node.js >= 18
- pnpm (ou npm / yarn)

## Installation

```bash
pnpm install

docker run -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postrgres -e POSTGRES_DB=ask_rules --name postgres_vector -p 5432:5432 -d ankane/pgvector
```

## Utilisation

### Développement — exécution directe avec ts-node

```bash
# Analyser un fichier texte
npx ts-node src/analyser.ts data/manuel.txt

# Analyser un fichier PDF
npx ts-node src/analyser.ts data/manuel.pdf

# Avec embeddings Transformers.js local (recommandé, multilingue, offline)
pnpm add @huggingface/transformers  # Installation unique
npx ts-node src/analyser.ts data/manuel.txt --embed
# Au 1er lancement : télécharge le modèle (~50MB), puis utilise le cache

# Avec embeddings OpenAI (optionnel)
OPENAI_API_KEY=sk-... npx ts-node src/analyser.ts data/manuel.txt --embed

# Fichier de sortie personnalisé
npx ts-node src/analyser.ts data/manuel.txt --output exports/mon_analyse.json
```

### Production — compilation puis exécution

```bash
pnpm run build                         # Compile src/ → dist/
node dist/analyser.js data/manuel.txt
```

### Via les scripts npm

```bash
pnpm start              # ts-node data/manuel.txt → data/resultat.json
pnpm run analyse:txt    # Identique
pnpm run analyse:pdf    # Analyse data/manuel.pdf
pnpm run build          # Compile TypeScript vers dist/
pnpm run start:dist     # node dist/ (après build)
```

## Modes d'embeddings

Le module `embedder.ts` supporte **3 modes** avec sélection automatique :

### Mode 1 : Transformers.js local (✅ Recommandé)

```bash
pnpm add @huggingface/transformers  # Installation unique
npx ts-node src/analyser.ts data/manuel.txt --embed
```

- **Modèle** : `Xenova/multilingual-e5-small` (384 dims)
- **Avantages** :
  - ✅ 100% gratuit et offline (après 1er téléchargement)
  - ✅ Multilingue optimisé (français, anglais, etc.)
  - ✅ Pas de clé API requise
  - ✅ Exécution locale en Node.js
- **1er lancement** : Télécharge automatiquement le modèle (~50MB), puis cache local

### Mode 2 : OpenAI (optionnel)

```bash
export OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
pnpm add openai  # Installation requise
npx ts-node src/analyser.ts data/manuel.txt --embed
```

- **Modèle** : `text-embedding-3-small` (1536 dims)
- **Avantages** : Très performant, multilingue
- **Inconvénients** : Payant, nécessite une connexion internet

### Mode 3 : TF-IDF local (fallback)

```bash
# Automatique si aucun embedding disponible
npx ts-node src/analyser.ts data/manuel.txt --embed
```

- **Avantages** : Aucune dépendance externe, ultra-léger
- **Inconvénients** : Qualité inférieure aux embeddings neuronaux

**Ordre de priorité** : Transformers.js → OpenAI → TF-IDF.

## Cache Redis

Pour réduire les coûts d'API et améliorer les performances, un système de cache Redis a été intégré :

### Configuration

```bash
# 1. Lancer Redis (Docker)
docker run -d -p 6379:6379 --name ask-rules-redis redis:7-alpine

# 2. Configurer l'application (.env)
REDIS_URL=redis://localhost:6379

# 3. Installer les dépendances
pnpm install
```

### Fonctionnement

- ✅ **Cache automatique** : Les questions/réponses sont mises en cache pendant 24h
- ✅ **Normalisation** : Les questions similaires utilisent le même cache
- ✅ **Mode graceful** : Si Redis n'est pas disponible, l'app continue sans cache
- ⚡ **Performance** : ~50-200ms depuis le cache vs 1-5s depuis le LLM

### Documentation complète

Consultez [docs/REDIS_CACHE_GUIDE.md](docs/REDIS_CACHE_GUIDE.md) pour :

- Configuration détaillée
- Services Redis managés (AWS, Redis Cloud, etc.)
- Commandes de monitoring
- Dépannage

## Protection Anti-Spam

Un système de rate limiting protège l'application contre les abus :

### Fonctionnement

- 🛡️ **Limite** : Maximum 10 questions par minute par IP
- ⏱️ **Blocage** : 5 minutes après dépassement
- 🎯 **Détection IP** : Support des proxies (X-Forwarded-For, X-Real-IP)
- ✅ **Whitelist** : IPs exemptées configurables

### Configuration

```env
# Optionnel : IPs exemptées du rate limiting
RATE_LIMIT_WHITELIST=127.0.0.1,::1
```

### Documentation complète

Consultez [docs/RATE_LIMITING_GUIDE.md](docs/RATE_LIMITING_GUIDE.md) pour :

- Personnalisation des limites
- Monitoring et statistiques
- Déblocage manuel d'IPs
- Tests et sécurité en production

## Format de sortie (resultat.json)

```json
{
  "manuel": "manuel",
  "fichier": "/chemin/absolu/data/manuel.txt",
  "date_analyse": "2026-02-20T10:00:00.000Z",
  "statistiques": {
    "caracteres": 7829,
    "mots": 974,
    "sections": 22,
    "entites_total": 44,
    "actions_total": 89
  },
  "sections": [
    {
      "titre": "INSTALLATION",
      "contenu": "Follow the steps below to install SmartFlow Pro...",
      "entites": ["configure", "download", "engine", "finish"],
      "actions": ["accept", "click", "choose", "complete", "download"],
      "resume": "Follow the steps below to install SmartFlow Pro on your machine.",
      "embedding": { "install": 0.42, "wizard": 0.31, "database": 0.28 }
    }
  ]
}
```

## Bibliothèques utilisées

| Bibliothèque | Usage                                           | Licence    |
| ------------ | ----------------------------------------------- | ---------- |
| `compromise` | NLP : extraction d'entités et de verbes         | MIT        |
| `pdfreader`  | Extraction de texte depuis des PDFs             | Apache 2.0 |
| `chalk`      | Affichage coloré dans le terminal               | MIT        |
| `typescript` | Compilation et typage statique                  | Apache 2.0 |
| `ts-node`    | Exécution TypeScript sans compilation préalable | MIT        |

## Interfaces TypeScript (src/types.ts)

```typescript
interface Section {
  titre: string;
  contenu: string;
  entites: string[];
  actions: string[];
  resume: string;
  embedding?: number[] | Record<string, number> | null;
}

interface AnalysisResult {
  manuel: string;
  fichier: string;
  date_analyse: string;
  statistiques: Statistics;
  sections: Section[];
}
```

## Support du français

`compromise` est optimisé pour l'anglais. Pour analyser des textes en français :

**Option 1 — Plugin compromise-fr**

```bash
pnpm add compromise-fr
```

```typescript
import nlp from 'compromise';
import frPlugin from 'compromise-fr';
nlp.extend(frPlugin);
```

**Option 2 — nlp.js (support multilingue natif)**

```bash
pnpm add node-nlp @nlpjs/lang-fr
```

Voir [documentation nlp.js](https://github.com/axa-group/nlp.js)

## Extension : base vectorielle

Pour indexer les embeddings dans une base vectorielle et interroger le manuel
depuis un LLM, vous pouvez utiliser :

- **[ChromaDB](https://www.trychroma.com/)** — base vectorielle locale, SDK JS disponible
- **[pgvector](https://github.com/pgvector/pgvector)** — extension PostgreSQL
- **[Weaviate](https://weaviate.io/)** — base vectorielle cloud/local

Exemple d'indexation avec Chroma :

```typescript
import { ChromaClient } from 'chromadb';
import type { AnalysisResult } from './src/types';

const client = new ChromaClient();
const collection = await client.createCollection({ name: 'manuel' });
const resultat: AnalysisResult = JSON.parse(fs.readFileSync('data/resultat.json', 'utf-8'));

for (const section of resultat.sections) {
  await collection.add({
    ids: [section.titre],
    embeddings: [section.embedding as number[]], // vecteur OpenAI dense
    documents: [section.contenu],
    metadatas: [{ actions: section.actions.join(',') }],
  });
}
```
