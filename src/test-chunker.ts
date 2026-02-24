/**
 * test-chunker.ts — Script de test du chunking intelligent
 * 
 * Usage :
 *   npx tsx src/test-chunker.ts
 */

import { chunkSections, getChunkingStats, enrichChunkContent } from './modules/chunker';
import type { RawSection } from './types';

// ── Données de test ───────────────────────────────────────────────────────────

const testSections: RawSection[] = [
  {
    titre: 'MATÉRIEL',
    niveau: 1,
    contenu: `Le jeu contient 120 cartes réparties en trois catégories principales.

Les cartes Action permettent aux joueurs d'effectuer diverses opérations pendant leur tour. Chaque carte Action indique son coût en points d'action en haut à gauche et son effet en bas de la carte.

Les cartes Ressource représentent les matières premières que les joueurs collectent et utilisent. Il existe cinq types de ressources : le bois, la pierre, le fer, l'or et les gemmes.

Les cartes Événement introduisent des situations spéciales qui affectent tous les joueurs. Elles sont révélées au début de chaque tour et restent actives jusqu'à la fin de la phase.

Le plateau de jeu est divisé en neuf régions distinctes. Chaque région produit des ressources spécifiques et offre des avantages stratégiques différents. Les joueurs peuvent placer leurs pions dans n'importe quelle région disponible.`,
    page_debut: 2,
    page_fin: 3,
  },
  {
    titre: 'Cartes Action',
    niveau: 2,
    contenu: `Les cartes Action sont le moteur principal du jeu. Chaque joueur commence avec une main de cinq cartes Action.

Liste des actions disponibles :
- Construire : permet d'ériger un bâtiment
- Explorer : révèle une nouvelle région
- Commercer : échange des ressources avec d'autres joueurs
- Attaquer : lance un combat contre un adversaire

Le coût des actions varie selon leur puissance. Une action simple coûte 1 point d'action, tandis qu'une action complexe peut en coûter 3 ou 4.`,
    page_debut: 3,
    page_fin: 4,
  },
  {
    titre: 'TOUR DE JEU',
    niveau: 1,
    contenu: `Chaque tour de jeu se déroule en cinq phases distinctes et obligatoires.

Phase 1 : Entretien
Le joueur actif pioche deux cartes de sa pioche personnelle et reçoit 3 points d'action. Si sa pioche est vide, il mélange sa défausse pour former une nouvelle pioche.

Phase 2 : Événement
Une carte Événement est révélée du deck central. Tous les joueurs appliquent immédiatement l'effet de cette carte.

Phase 3 : Actions
Le joueur actif dépense ses points d'action pour jouer des cartes ou activer des capacités. Il peut réaliser autant d'actions que ses points le permettent.

Phase 4 : Commerce
Les joueurs peuvent échanger librement des ressources entre eux. Aucun point d'action n'est requis pour le commerce.

Phase 5 : Défausse
Le joueur actif défausse toutes ses cartes restantes et termine son tour. Le joueur suivant devient le joueur actif.`,
    page_debut: 5,
    page_fin: 6,
  },
  {
    titre: 'Petite Section',
    niveau: 2,
    contenu: 'Cette section est très courte et ne sera pas divisée en chunks.',
    page_debut: 7,
    page_fin: 7,
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('🧪 Test du Chunking Intelligent\n');
console.log('═'.repeat(60));

// Test 1 : Chunking de base
console.log('\n1️⃣  CHUNKING DE BASE\n');
const chunks = chunkSections(testSections);
console.log(`Nombre de chunks générés : ${chunks.length}\n`);

for (const [i, chunk] of chunks.entries()) {
  const wordCount = chunk.content.split(/\s+/).filter(Boolean).length;
  console.log(`Chunk ${i + 1}/${chunks.length}`);
  console.log(`  Titre:     ${chunk.originalSection.titre}`);
  console.log(`  Hiérarchie: ${chunk.metadata.hierarchyPath}`);
  console.log(`  Index:     ${chunk.metadata.chunkIndex}/${chunk.metadata.totalChunks}`);
  console.log(`  Taille:    ${wordCount} mots, ${chunk.content.length} chars`);
  console.log(`  Contenu:   ${chunk.content.substring(0, 80)}...`);
  console.log();
}

// Test 2 : Statistiques
console.log('\n2️⃣  STATISTIQUES DE CHUNKING\n');
const stats = getChunkingStats(chunks);
console.log(`Total chunks:         ${stats.totalChunks}`);
console.log(`Mots par chunk:       ${stats.minWords} - ${stats.maxWords} mots`);
console.log(`Moyenne:              ${stats.avgWordsPerChunk} mots`);
console.log(`Chunks avec overlap:  ${stats.chunksWithOverlap}`);

// Test 3 : Enrichissement du contenu
console.log('\n3️⃣  ENRICHISSEMENT POUR EMBEDDINGS\n');
const firstChunk = chunks[0];
const enriched = enrichChunkContent(firstChunk, true);
console.log('Contenu enrichi (100 premiers caractères) :');
console.log('─'.repeat(60));
console.log(enriched.substring(0, 150) + '...\n');

// Test 4 : Vérification de l'overlap
console.log('\n4️⃣  VÉRIFICATION DE L\'OVERLAP\n');
const materielsChunks = chunks.filter(c => c.originalSection.titre === 'MATÉRIEL');
if (materielsChunks.length >= 2) {
  const chunk1 = materielsChunks[0];
  const chunk2 = materielsChunks[1];

  const lastWords1 = chunk1.content.split(/\s+/).slice(-10).join(' ');
  const firstWords2 = chunk2.content.split(/\s+/).slice(0, 10).join(' ');

  console.log('Chunk 1 (10 derniers mots):');
  console.log(`  "${lastWords1}"`);
  console.log('\nChunk 2 (10 premiers mots):');
  console.log(`  "${firstWords2}"`);

  // Vérifie si il y a un overlap
  const hasOverlap = chunk2.content.includes(lastWords1.split(/\s+/)[0]);
  console.log(`\n✓ Overlap détecté: ${hasOverlap ? 'OUI' : 'NON'}`);
}

console.log('\n═'.repeat(60));
console.log('✅ Tests terminés avec succès!\n');
