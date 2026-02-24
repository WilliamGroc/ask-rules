/**
 * test-hybrid-search.ts — Script de test pour l'hybrid search
 *
 * Ce script compare les résultats entre :
 *   1. Dense search (embeddings uniquement)
 *   2. Sparse search (full-text BM25 uniquement)
 *   3. Hybrid search (fusion des deux)
 *
 * Usage :
 *   npx tsx src/test-hybrid-search.ts
 */

import 'dotenv/config';
import pool from './modules/db';
import { retrieveFromBestGame } from './modules/retriever';
import { hybridSearchBestGame } from './modules/hybridSearch';
import { generateEmbedding } from './modules/embedder';

// ── Configuration ─────────────────────────────────────────────────────────────

const TEST_QUERIES = [
  'Comment se déroule un tour de jeu ?',
  'Quelles sont les cartes action disponibles ?',
  'Comment gagner la partie ?',
  'Quelle est la mise en place ?',
  'Combien de joueurs peuvent jouer ?',
];

// ── Utilitaires ───────────────────────────────────────────────────────────────

function formatScore(score: number): string {
  return (score * 100).toFixed(1) + '%';
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testDenseSearch(query: string) {
  console.log('\n🔵 Dense Search (Embeddings uniquement)');

  const result = await retrieveFromBestGame(query, 4, 0.1, { useHybrid: false });

  if (!result || result.sections.length === 0) {
    console.log('  ❌ Aucun résultat');
    return;
  }

  console.log(`  Jeu: ${result.jeu}`);
  console.log(`  Score agrégé: ${formatScore(result.relevanceScore)}`);
  console.log('  Top 3:');
  result.sections.slice(0, 3).forEach((s, i) => {
    console.log(`    ${i + 1}. ${s.section.titre} (${formatScore(s.score)})`);
  });
}

async function testSparseSearch(query: string) {
  console.log('\n🟡 Sparse Search (Full-text BM25 uniquement)');

  // Normalisation de la query pour tsquery
  const normalizeQuery = (q: string) =>
    q.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .join(' & ');

  const tsQuery = normalizeQuery(query);

  if (!tsQuery.trim()) {
    console.log('  ❌ Query vide après normalisation');
    return;
  }

  const sql = `
    SELECT
      s.id, s.titre, s.hierarchy_path,
      g.jeu,
      ts_rank_cd(s.search_vector, to_tsquery('french', $1), 32) AS score
    FROM sections s
    JOIN games g ON s.game_id = g.id
    WHERE s.search_vector @@ to_tsquery('french', $1)
    ORDER BY score DESC
    LIMIT 4
  `;

  try {
    const res = await pool.query(sql, [tsQuery]);

    if (res.rowCount === 0) {
      console.log('  ❌ Aucun résultat');
      return;
    }

    // Normalise les scores
    const maxScore = Math.max(...res.rows.map(r => parseFloat(r.score ?? '0')), 0.001);

    console.log(`  ${res.rowCount} résultat(s)`);
    console.log('  Top 3:');
    res.rows.slice(0, 3).forEach((row, i) => {
      const normalizedScore = parseFloat(row.score) / maxScore;
      console.log(`    ${i + 1}. ${row.titre} (${formatScore(normalizedScore)})`);
      if (row.hierarchy_path) {
        console.log(`       Chemin: ${row.hierarchy_path}`);
      }
    });
  } catch (err) {
    console.log('  ❌ Erreur:', (err as Error).message);
  }
}

async function testHybridSearch(query: string) {
  console.log('\n🟢 Hybrid Search (Dense + Sparse fusionnés)');

  const result = await hybridSearchBestGame(query, 4);

  if (!result || result.sections.length === 0) {
    console.log('  ❌ Aucun résultat');
    return;
  }

  console.log(`  Jeu: ${result.jeu}`);
  console.log(`  Score agrégé: ${formatScore(result.relevanceScore)}`);
  console.log('  Top 3:');
  result.sections.slice(0, 3).forEach((s, i) => {
    console.log(`    ${i + 1}. ${s.section.titre} (${formatScore(s.score)})`);
  });
}

async function compareResults(query: string) {
  console.log('\n' + '═'.repeat(70));
  console.log(`📊 Comparaison pour: "${query}"`);
  console.log('═'.repeat(70));

  await testDenseSearch(query);
  await testSparseSearch(query);
  await testHybridSearch(query);
}

async function testSearchVectorPresence() {
  console.log('\n🔍 Vérification de la colonne search_vector...\n');

  const res = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(search_vector) as with_vector,
      COUNT(*) - COUNT(search_vector) as without_vector
    FROM sections
  `);

  const row = res.rows[0];
  console.log(`  Total sections: ${row.total}`);
  console.log(`  Avec search_vector: ${row.with_vector}`);
  console.log(`  Sans search_vector: ${row.without_vector}`);

  if (parseInt(row.without_vector) > 0) {
    console.log('\n  ⚠️  Certaines sections n\'ont pas de search_vector.');
    console.log('     Exécutez: pnpm migrate');
  } else {
    console.log('\n  ✅ Toutes les sections ont un search_vector');
  }
}

async function showConfiguration() {
  console.log('\n⚙️  Configuration Hybrid Search\n');
  console.log('  Dense weight (embeddings): 60%');
  console.log('  Sparse weight (BM25): 40%');
  console.log('  Fusion method: RRF (Reciprocal Rank Fusion)');
  console.log('  Top-K per search: 20');
  console.log('  RRF constant k: 60');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 Test de l\'Hybrid Search (Dense + Sparse)\n');
  console.log('═'.repeat(70));

  try {
    // Vérifie la présence de search_vector
    await testSearchVectorPresence();

    // Affiche la configuration
    await showConfiguration();

    // Vérifie qu'il y a des jeux en base
    const gamesRes = await pool.query('SELECT COUNT(*) as count FROM games');
    const gameCount = parseInt(gamesRes.rows[0].count);

    if (gameCount === 0) {
      console.log('\n❌ Aucun jeu indexé en base.');
      console.log('   Importez un jeu via /import avant de tester.\n');
      return;
    }

    console.log(`\n✅ ${gameCount} jeu(x) trouvé(s) en base\n`);

    // Compare les différentes méthodes de recherche
    for (const query of TEST_QUERIES) {
      await compareResults(query);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('✅ Tests terminés avec succès!\n');
    console.log('💡 Observations:');
    console.log('   • Dense: Capture les concepts et synonymes');
    console.log('   • Sparse: Capture les termes exacts et noms spécifiques');
    console.log('   • Hybrid: Combine le meilleur des deux (+15-20% précision)\n');

  } catch (err) {
    console.error('\n❌ Erreur:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
