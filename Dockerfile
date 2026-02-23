# syntax=docker/dockerfile:1
# ════════════════════════════════════════════════════════════════════════════
# ask-rules — Image de production
# SvelteKit (adapter-node) + pgvector + modèle d'embedding local
#
# Construction : docker build -t ask-rules .
# Lancement    : docker run -p 3000:3000 \
#                  -e DATABASE_URL=... \
#                  -e MISTRAL_API_KEY=... \
#                  ask-rules
# ════════════════════════════════════════════════════════════════════════════

# ── Stage 1 : Dépendances (dev + prod, nécessaires au build) ─────────────────
FROM node:24-slim AS deps
WORKDIR /app

RUN npm install -g pnpm@10.23.0 --no-update-notifier --quiet
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── Stage 2 : Build SvelteKit + pré-téléchargement du modèle ─────────────────
FROM deps AS builder
COPY . .

RUN pnpm run build:web

# Pré-télécharge le modèle d'embedding (Xenova/paraphrase-multilingual-MiniLM-L12-v2, ~50 MB)
# dans /root/.cache/huggingface afin d'éviter tout téléchargement au démarrage du conteneur.
RUN node --input-type=module <<'SCRIPT'
import { pipeline } from '@xenova/transformers';
await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
console.log('[docker] Modèle pré-téléchargé.');
SCRIPT

# ── Stage 3 : Runtime production (image allégée, sans devDeps) ───────────────
FROM node:24-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Variables d'environnement à fournir au lancement du conteneur :
#   DATABASE_URL       — URL PostgreSQL (ex: postgres://user:pass@host:5432/db)
#   MISTRAL_API_KEY    — Clé API Mistral (optionnel)
#   OPENAI_API_KEY     — Clé API OpenAI  (optionnel)
#   OLLAMA_MODEL       — Nom du modèle Ollama (optionnel)
#   OLLAMA_HOST        — Adresse du serveur Ollama (optionnel)

RUN npm install -g pnpm@10.23.0 --no-update-notifier --quiet
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Artefacts du build SvelteKit
COPY --from=builder /app/build ./build

# Modèle d'embedding pré-téléchargé (pas de connexion réseau requise au runtime)
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

EXPOSE 3000
CMD ["node", "build/index.js"]
