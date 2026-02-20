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
├── data/
│   ├── manuel.txt                # Exemple de manuel d'entrée
│   └── resultat.json             # Sortie générée automatiquement
├── tsconfig.json
└── package.json
```

## Prérequis

- Node.js >= 18
- pnpm (ou npm / yarn)

## Installation

```bash
pnpm install
```

## Utilisation

### Développement — exécution directe avec ts-node

```bash
# Analyser un fichier texte
npx ts-node src/analyser.ts data/manuel.txt

# Analyser un fichier PDF
npx ts-node src/analyser.ts data/manuel.pdf

# Avec embeddings TF-IDF local (sans clé API)
npx ts-node src/analyser.ts data/manuel.txt --embed

# Avec embeddings OpenAI
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

| Bibliothèque | Usage | Licence |
|---|---|---|
| `compromise` | NLP : extraction d'entités et de verbes | MIT |
| `pdf-parse` | Extraction de texte depuis des PDFs | MIT |
| `chalk` | Affichage coloré dans le terminal | MIT |
| `typescript` | Compilation et typage statique | Apache 2.0 |
| `ts-node` | Exécution TypeScript sans compilation préalable | MIT |

## Interfaces TypeScript (src/types.ts)

```typescript
interface Section {
  titre:    string;
  contenu:  string;
  entites:  string[];
  actions:  string[];
  resume:   string;
  embedding?: number[] | Record<string, number> | null;
}

interface AnalysisResult {
  manuel:       string;
  fichier:      string;
  date_analyse: string;
  statistiques: Statistics;
  sections:     Section[];
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

const client     = new ChromaClient();
const collection = await client.createCollection({ name: 'manuel' });
const resultat: AnalysisResult = JSON.parse(fs.readFileSync('data/resultat.json', 'utf-8'));

for (const section of resultat.sections) {
  await collection.add({
    ids:        [section.titre],
    embeddings: [section.embedding as number[]],  // vecteur OpenAI dense
    documents:  [section.contenu],
    metadatas:  [{ actions: section.actions.join(',') }],
  });
}
```
