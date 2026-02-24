/**
 * test-file-storage.ts — Test du système de stockage local
 * 
 * Usage:
 *   npx tsx src/test-file-storage.ts
 */

import fs from 'fs';
import path from 'path';
import {
  saveUploadedFile,
  listGameFiles,
  deleteGameFiles,
  getTotalStorageSize,
  formatSize,
  fileExists,
  getAbsolutePath,
} from './modules/fileStorage';

console.log('🧪 Test du système de stockage local\n');

// ── Test 1 : Sauvegarde de fichiers ─────────────────────────────────────────

console.log('📝 Test 1 : Sauvegarde de fichiers');

const testGame = 'test-game-' + Date.now();
const testContent1 = Buffer.from('Contenu de test pour le fichier 1\nLigne 2\nLigne 3');
const testContent2 = Buffer.from('Contenu de test pour le fichier 2');

const path1 = saveUploadedFile(testGame, 'regles.pdf', testContent1);
const path2 = saveUploadedFile(testGame, 'errata.txt', testContent2);

console.log(`  ✅ Fichier 1 sauvegardé : ${path1}`);
console.log(`  ✅ Fichier 2 sauvegardé : ${path2}`);

// ── Test 2 : Listage des fichiers ──────────────────────────────────────────

console.log('\n📋 Test 2 : Listage des fichiers');

const files = listGameFiles(testGame);
console.log(`  ✅ ${files.length} fichiers trouvés :`);
files.forEach(f => console.log(`     - ${f}`));

if (files.length !== 2) {
  console.error(`  ❌ ERREUR : Attendu 2 fichiers, trouvé ${files.length}`);
  process.exit(1);
}

// ── Test 3 : Vérification d'existence ──────────────────────────────────────

console.log('\n🔍 Test 3 : Vérification d\'existence');

const exists1 = fileExists(path1);
const exists2 = fileExists(path2);
const existsFake = fileExists('uploads/fake/fake.pdf');

console.log(`  ✅ ${path1}: ${exists1 ? 'existe' : 'N\'EXISTE PAS ❌'}`);
console.log(`  ✅ ${path2}: ${exists2 ? 'existe' : 'N\'EXISTE PAS ❌'}`);
console.log(`  ✅ fichier fake: ${existsFake ? 'EXISTE ❌' : 'n\'existe pas'}`);

if (!exists1 || !exists2 || existsFake) {
  console.error('  ❌ ERREUR : Vérification d\'existence échouée');
  process.exit(1);
}

// ── Test 4 : Lecture du contenu ────────────────────────────────────────────

console.log('\n📖 Test 4 : Lecture du contenu');

const absolutePath1 = getAbsolutePath(path1);
const readContent = fs.readFileSync(absolutePath1, 'utf-8');

if (readContent === testContent1.toString()) {
  console.log('  ✅ Contenu lu correctement');
} else {
  console.error('  ❌ ERREUR : Contenu différent');
  console.error(`     Attendu: ${testContent1.toString()}`);
  console.error(`     Lu: ${readContent}`);
  process.exit(1);
}

// ── Test 5 : Taille du stockage ────────────────────────────────────────────

console.log('\n💾 Test 5 : Taille du stockage');

const totalSize = getTotalStorageSize();
console.log(`  ✅ Taille totale : ${formatSize(totalSize)}`);

// ── Test 6 : Nettoyage des caractères spéciaux ─────────────────────────────

console.log('\n🧹 Test 6 : Nettoyage des caractères spéciaux');

const testFilename = 'Règles (2023) - v2.1 @final!.pdf';
const path3 = saveUploadedFile(testGame, testFilename, testContent1);
console.log(`  ✅ Fichier spécial sauvegardé :`);
console.log(`     Input : ${testFilename}`);
console.log(`     Output: ${path3}`);

// Vérifie que les caractères spéciaux ont été nettoyés
if (path3.includes('(') || path3.includes(')') || path3.includes('@') || path3.includes('!')) {
  console.error('  ❌ ERREUR : Caractères spéciaux non nettoyés');
  process.exit(1);
}

// ── Test 7 : Suppression ───────────────────────────────────────────────────

console.log('\n🗑️  Test 7 : Suppression des fichiers');

deleteGameFiles(testGame);

const filesAfter = listGameFiles(testGame);
console.log(`  ✅ ${filesAfter.length} fichiers restants (attendu : 0)`);

if (filesAfter.length !== 0) {
  console.error('  ❌ ERREUR : Fichiers non supprimés');
  process.exit(1);
}

// Vérifie que le répertoire n'existe plus
const gameDir = path.join(process.cwd(), 'uploads', testGame);
if (fs.existsSync(gameDir)) {
  console.error('  ❌ ERREUR : Répertoire non supprimé');
  process.exit(1);
}

console.log('  ✅ Répertoire supprimé');

// ── Résumé ─────────────────────────────────────────────────────────────────

console.log('\n✨ Tous les tests réussis !\n');

console.log('📊 Résumé :');
console.log('  ✅ Sauvegarde de fichiers');
console.log('  ✅ Listage des fichiers');
console.log('  ✅ Vérification d\'existence');
console.log('  ✅ Lecture du contenu');
console.log('  ✅ Calcul de taille');
console.log('  ✅ Nettoyage des caractères spéciaux');
console.log('  ✅ Suppression des fichiers');
console.log('\n✅ Le système de stockage local fonctionne correctement.\n');
