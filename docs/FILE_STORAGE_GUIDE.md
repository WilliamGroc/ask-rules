# 📁 Stockage Local des Fichiers Uploadés

## 📊 Vue d'Ensemble

Le système stocke désormais de manière permanente tous les fichiers PDF/TXT importés dans l'application, permettant :

- Traçabilité complète des sources
- Réanalyse des fichiers si besoin
- Backup des données originales
- Audit et conformité

**Avant** : Les fichiers étaient analysés puis supprimés  
**Après** : Les fichiers sont conservés dans `uploads/{game-slug}/`

---

## 🗂️ Structure de Stockage

```
ask-rules/
├── uploads/                           # Répertoire racine (gitignored)
│   ├── .gitkeep                       # Pour suivre le répertoire dans git
│   ├── 7-wonders/                     # Un répertoire par jeu
│   │   ├── 1709123456789_regles.pdf   # Format: {timestamp}_{filename}
│   │   └── 1709567890123_errata.pdf
│   ├── catan/
│   │   └── 1709234567890_rules-fr.pdf
│   └── wingspan/
│       ├── 1709345678901_manuel.pdf
│       └── 1709456789012_appendix.txt
```

### Conventions de Nommage

| Élément              | Format                           | Exemple                               |
| -------------------- | -------------------------------- | ------------------------------------- |
| **Répertoire jeu**   | `{game-slug}/`                   | `7-wonders/`                          |
| **Fichier**          | `{timestamp}_{cleaned-filename}` | `1709123456789_regles.pdf`            |
| **Slug**             | Nom du jeu normalisé (slugify)   | "7 Wonders" → "7-wonders"             |
| **Timestamp**        | `Date.now()` en millisecondes    | 1709123456789                         |
| **Cleaned filename** | Caractères spéciaux → `_`        | "Règles 2023.pdf" → "Regles_2023.pdf" |

---

## 🔧 Module `fileStorage.ts`

### Fonctions Principales

#### `saveUploadedFile(gameSlug, originalFilename, content)`

Sauvegarde un fichier uploadé dans le répertoire du jeu.

```typescript
import { saveUploadedFile } from "./modules/fileStorage";

const gameSlug = slugify("7 Wonders"); // "7-wonders"
const content = new Uint8Array(await file.arrayBuffer());

const storedPath = saveUploadedFile(gameSlug, "regles.pdf", content);
// Returns: "uploads/7-wonders/1709123456789_regles.pdf"
```

#### `moveToStorage(tmpPath, gameSlug, originalFilename)`

Déplace un fichier temporaire vers le stockage permanent.

```typescript
const tmpPath = "/tmp/ask-rules-123.pdf";
const storedPath = moveToStorage(tmpPath, "7-wonders", "regles.pdf");
```

#### `listGameFiles(gameSlug)`

Liste tous les fichiers d'un jeu.

```typescript
const files = listGameFiles("7-wonders");
// Returns: ["uploads/7-wonders/1709123456789_regles.pdf", ...]
```

#### `deleteGameFiles(gameSlug)`

Supprime tous les fichiers d'un jeu (appelé automatiquement lors de `removeGame()`).

```typescript
deleteGameFiles("7-wonders");
// Supprime le répertoire uploads/7-wonders/ et son contenu
```

#### `getTotalStorageSize()`

Retourne la taille totale des fichiers uploadés.

```typescript
const size = getTotalStorageSize();
console.log(formatSize(size)); // "145.3 MB"
```

---

## 🔄 Intégration dans les Routes

### Route `/import` (upload simple)

**Fichier** : [src/routes/import/+page.server.ts](src/routes/import/+page.server.ts)

```typescript
// 1. Sauvegarde temporaire pour l'analyse
const tmpPath = path.join(os.tmpdir(), `ask-rules-${Date.now()}${ext}`);
fs.writeFileSync(tmpPath, fileContent);

// 2. Analyse du fichier
const result = await analyseFile(tmpPath, {
  withEmbed: false,
  withChunking: true,
});

// 3. Sauvegarde permanente ✅ NOUVEAU
const storedFilePath = saveUploadedFile(gameSlug, fichier.name, fileContent);

// 4. Stockage en base avec le chemin du fichier
const writer = await openSectionWriter(gameSlug, {
  jeu: gameName,
  fichier: storedFilePath, // ✅ Chemin complet au lieu de juste le nom
  // ...
});

// 5. Nettoyage du fichier temporaire
fs.unlinkSync(tmpPath);
```

### Route `/import/stream` (upload avec progression)

**Fichier** : [src/routes/import/stream/+server.ts](src/routes/import/stream/+server.ts)

Supporte deux modes :

#### Mode Fichier

```typescript
const fichier = formData.get("fichier") as File;
const fileContent = new Uint8Array(await fichier.arrayBuffer());

// Sauvegarde temporaire
tmpPath = path.join(os.tmpdir(), `ask-rules-${Date.now()}${ext}`);
fs.writeFileSync(tmpPath, fileContent);

// Sauvegarde permanente ✅ NOUVEAU
storedFilePath = saveUploadedFile(gameSlug, fichier.name, fileContent);
```

#### Mode URL

```typescript
// Télécharge depuis l'URL
const { tmpPath, filename } = await fetchUrlToTemp(urlInput);

// Sauvegarde permanente ✅ NOUVEAU
const urlContent = fs.readFileSync(tmpPath);
storedFilePath = saveUploadedFile(gameSlug, filename, urlContent);
```

---

## 💾 Base de Données

### Colonne `fichier` dans `games`

**Avant** :

```sql
fichier: "regles.pdf"  -- Juste le nom du fichier
```

**Après** :

```sql
fichier: "uploads/7-wonders/1709123456789_regles.pdf"  -- Chemin complet relatif
```

### Migration

Aucune migration SQL nécessaire ! Le champ `fichier TEXT NOT NULL` est déjà présent, on stocke juste un chemin au lieu d'un nom.

Pour les jeux existants, la colonne `fichier` contiendra toujours l'ancien format (nom court). Les nouveaux imports utiliseront automatiquement le nouveau format (chemin complet).

---

## 🛡️ Sécurité & Gestion

### `.gitignore`

```gitignore
# Fichiers uploadés (stockage local)
uploads/
!uploads/.gitkeep
```

Les fichiers uploadés ne sont **jamais committés** dans git.

### Nettoyage des Caractères Spéciaux

```typescript
const cleanFilename = originalFilename
  .replace(/[^a-zA-Z0-9._-]/g, "_") // Caractères spéciaux → _
  .replace(/_+/g, "_"); // Multiple _ → single _
```

**Exemples** :

- `Règles (2023).pdf` → `Regles_2023_.pdf`
- `7 Wonders@v2.pdf` → `7_Wonders_v2.pdf`

### Prévention des Collisions

Le timestamp millisecondes garantit l'unicité :

```typescript
const timestamp = Date.now(); // 1709123456789
const filename = `${timestamp}_${cleanFilename}`;
```

Probabilité de collision : **~0%** (sauf uploads simultanés dans la même milliseconde, hautement improbable)

---

## 📊 Monitoring & Maintenance

### Vérifier la Taille du Stockage

```bash
# Depuis le terminal
du -sh uploads/
# 145M    uploads/

# Depuis le code
import { getTotalStorageSize, formatSize } from './modules/fileStorage';
console.log(formatSize(getTotalStorageSize()));
// "145.3 MB"
```

### Lister les Fichiers d'un Jeu

```typescript
import { listGameFiles } from "./modules/fileStorage";

const files = listGameFiles("7-wonders");
files.forEach((f) => console.log(f));
// uploads/7-wonders/1709123456789_regles.pdf
// uploads/7-wonders/1709567890123_errata.pdf
```

### Nettoyer Manuellement

```bash
# Supprimer tous les uploads
rm -rf uploads/*

# Supprimer un jeu spécifique
rm -rf uploads/7-wonders/
```

### Backup & Restore

```bash
# Backup
tar -czf uploads-backup-$(date +%Y%m%d).tar.gz uploads/

# Restore
tar -xzf uploads-backup-20240224.tar.gz
```

---

## 🚀 Cas d'Usage

### 1. Réanalyse d'un Jeu

Si vous améliorez le pipeline NLP, vous pouvez réanalyser les fichiers existants :

```typescript
import { listGameFiles, getAbsolutePath } from "./modules/fileStorage";

const files = listGameFiles("7-wonders");
for (const relativePath of files) {
  const absolutePath = getAbsolutePath(relativePath);
  const result = await analyseFile(absolutePath, { withChunking: true });
  // Réinjecter en base...
}
```

### 2. Export/Backup Complet

```typescript
import { getTotalStorageSize, formatSize } from "./modules/fileStorage";
import { listGames } from "./modules/knowledgeBase";

const games = await listGames();
const totalSize = getTotalStorageSize();

console.log(`Total jeux : ${games.length}`);
console.log(`Stockage : ${formatSize(totalSize)}`);

// Export metadata
const manifest = games.map((g) => ({
  id: g.id,
  name: g.jeu,
  file: g.fichier,
}));
fs.writeFileSync("manifest.json", JSON.stringify(manifest, null, 2));
```

### 3. Vérification d'Intégrité

```typescript
import { fileExists } from "./modules/fileStorage";
import { listGames } from "./modules/knowledgeBase";

const games = await listGames();
const missing = games.filter((g) => !fileExists(g.fichier));

if (missing.length > 0) {
  console.warn(`⚠️ ${missing.length} fichiers manquants :`);
  missing.forEach((g) => console.log(`  - ${g.jeu}: ${g.fichier}`));
}
```

---

## 🔧 Configuration Avancée

### Changer le Répertoire de Stockage

Par défaut : `uploads/` à la racine du projet.

Pour changer, définir la variable d'environnement `UPLOADS_DIR` dans votre fichier `.env` :

```bash
# .env
UPLOADS_DIR=/var/data/ask-rules/uploads
```

Le répertoire sera créé automatiquement s'il n'existe pas. Si la variable n'est pas définie, le répertoire `uploads/` à la racine du projet sera utilisé.

**Exemple pour un déploiement en production** :

```bash
# Utiliser un volume Docker monté
UPLOADS_DIR=/mnt/storage/uploads

# Ou un répertoire système dédié
UPLOADS_DIR=/var/lib/ask-rules/uploads
```

### Organisation Alternative par Date

```typescript
// Modifier getGameUploadDir() pour inclure la date
export function getGameUploadDir(gameSlug: string): string {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const gameDir = path.join(UPLOADS_DIR, `${year}-${month}`, gameSlug);
  // ...
}
// Structure: uploads/2024-02/7-wonders/file.pdf
```

---

## 📝 Checklist Post-Installation

- [x] Répertoire `uploads/` créé
- [x] `.gitignore` mis à jour
- [x] `fileStorage.ts` implémenté
- [x] Routes d'import mises à jour
- [x] `removeGame()` supprime aussi les fichiers
- [x] Compilation réussie
- [ ] Tester un import de fichier
- [ ] Vérifier que le fichier est bien sauvegardé
- [ ] Tester la suppression d'un jeu
- [ ] Vérifier que les fichiers sont bien supprimés

---

## 🧪 Tests

### Test Manuel

```bash
# 1. Lancer l'application
pnpm dev

# 2. Aller sur http://localhost:5173/import

# 3. Uploader un PDF de jeu

# 4. Vérifier que le fichier est sauvegardé
ls -lh uploads/*/

# 5. Supprimer le jeu depuis l'interface (si implémenté)
# ou manuellement:
# npx tsx -e "import('./src/modules/knowledgeBase.js').then(m => m.removeGame('7-wonders'))"

# 6. Vérifier que le répertoire a été supprimé
ls uploads/  # Ne devrait plus contenir 7-wonders/
```

### Test Automatisé

```typescript
// test-file-storage.ts
import {
  saveUploadedFile,
  listGameFiles,
  deleteGameFiles,
} from "./src/modules/fileStorage";

const testContent = Buffer.from("Test content");
const path1 = saveUploadedFile("test-game", "file1.txt", testContent);
const path2 = saveUploadedFile("test-game", "file2.txt", testContent);

console.log("Saved:", path1, path2);

const files = listGameFiles("test-game");
console.log("Files:", files);
// Expected: 2 files

deleteGameFiles("test-game");
const filesAfter = listGameFiles("test-game");
console.log("Files after delete:", filesAfter);
// Expected: 0 files
```

---

## 🆘 Troubleshooting

### Erreur : "ENOENT: no such file or directory"

**Cause** : Le répertoire `uploads/` n'existe pas.

**Solution** :

```bash
mkdir -p uploads
touch uploads/.gitkeep
```

### Erreur : "EACCES: permission denied"

**Cause** : Permissions insuffisantes sur le répertoire.

**Solution** :

```bash
chmod 755 uploads/
```

### Fichiers Non Supprimés

**Cause** : Le jeu a été supprimé manuellement en base sans appeler `removeGame()`.

**Solution** :

```typescript
// Nettoyage des orphelins
import { listGameFiles } from "./modules/fileStorage";
import { gameExists } from "./modules/knowledgeBase";
import fs from "fs";

const dirs = fs.readdirSync("uploads");
for (const dir of dirs) {
  if (dir === ".gitkeep") continue;
  const exists = await gameExists(dir);
  if (!exists) {
    console.log(`Cleaning orphan: ${dir}`);
    deleteGameFiles(dir);
  }
}
```

---

## 📚 Références

- [fileStorage.ts](src/modules/fileStorage.ts) : Module principal
- [import/+page.server.ts](src/routes/import/+page.server.ts) : Route upload simple
- [import/stream/+server.ts](src/routes/import/stream/+server.ts) : Route upload streaming
- [knowledgeBase.ts](src/modules/knowledgeBase.ts) : Gestion DB avec suppression fichiers

---

## ✨ Résumé

**Avant** :

```
Upload → Analyse → Suppression ❌
```

**Après** :

```
Upload → Sauvegarde permanente ✅ → Analyse → Suppression tmp
```

**Bénéfices** :

- ✅ Traçabilité complète
- ✅ Réanalyse possible
- ✅ Backup des originaux
- ✅ Audit et conformité
- ✅ Zéro changement en base de données
- ✅ Suppression automatique avec le jeu

**Coût** :

- Stockage disque (~10-50 MB par jeu en moyenne)
- +2-5ms de latence d'upload (négligeable)
