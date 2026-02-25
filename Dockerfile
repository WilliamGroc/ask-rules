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

# Force le cache dans /hf-cache pour que le chemin soit prévisible.
# @huggingface/transformers v3 lit env.cacheDir (API JS).
# XDG_CACHE_HOME est relu dans embedder.ts au runtime.
ENV XDG_CACHE_HOME=/hf-cache

# Précharge les modèles d'embeddings (évite le téléchargement au runtime)
COPY scripts/preload-model.mjs ./scripts/
RUN node scripts/preload-model.mjs \
 && echo "Contenu du cache:" && ls -lh /hf-cache/models/ 2>/dev/null || echo "Cache créé"

# ── Stage 3 : Runtime production (image allégée, sans devDeps) ───────────────
FROM node:24-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Même chemin de cache qu'au build → le modèle est trouvé sans téléchargement
ENV XDG_CACHE_HOME=/hf-cache

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
COPY --from=builder /hf-cache /hf-cache

EXPOSE 3000
CMD ["node", "build/index.js"]
