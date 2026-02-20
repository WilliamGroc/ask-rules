/**
 * analyser.ts — Analyse standalone d'un fichier de règles (sortie JSON)
 *
 * Usage direct :
 *   ts-node src/analyser.ts <fichier> [--embed] [--output <fichier.json>]
 *
 * Via index.ts :
 *   ts-node src/index.ts analyse <fichier> [--embed] [--output <fichier.json>]
 */

import fs   from 'fs';
import path from 'path';
import chalk from 'chalk';

import { analyseFile }   from './pipeline';
import type { GameAnalysisResult, GameMechanic } from './types';

// ── CLI ───────────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const filePath   = args.find(a => !a.startsWith('--'));
const withEmbed  = args.includes('--embed');
const outputFlag = args.indexOf('--output');
const outputPath = outputFlag !== -1
  ? args[outputFlag + 1]
  : path.resolve(__dirname, '../data/resultat.json');

if (!filePath) {
  console.error(chalk.red('✖  Erreur : aucun fichier spécifié.'));
  console.error(chalk.gray('   Usage : ts-node src/analyser.ts <fichier.txt|pdf> [--embed] [--output fichier.json]'));
  process.exit(1);
}
if (!fs.existsSync(filePath)) {
  console.error(chalk.red(`✖  Fichier introuvable : ${filePath}`));
  process.exit(1);
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const startTime = Date.now();

  console.log(chalk.bold.cyan('\n══════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('   Analyseur de Règles de Jeu de Société — PoC NLP   '));
  console.log(chalk.bold.cyan('══════════════════════════════════════════════════════\n'));
  console.log(chalk.blue(`📄 Fichier  : ${filePath}`));
  console.log(chalk.blue(`📦 Embedding: ${withEmbed ? 'activé' : 'désactivé (--embed pour activer)'}`));
  console.log(chalk.blue(`💾 Sortie   : ${outputPath}\n`));

  console.log(chalk.yellow('▶ Étape 1/2 — Analyse NLP…'));

  const result = await analyseFile(filePath!, {
    withEmbed,
    onSection: (i, total, titre) => {
      process.stdout.write(chalk.gray(`   Section ${i + 1}/${total} : "${titre}"…\r`));
    },
  });

  process.stdout.write(' '.repeat(80) + '\r');
  console.log(chalk.green(`   ✔ "${result.jeu}" — ${result.statistiques.sections} section(s) en ${((Date.now() - startTime) / 1000).toFixed(2)}s\n`));

  // ── Écriture du JSON ────────────────────────────────────────────────────────
  console.log(chalk.yellow('▶ Étape 2/2 — Génération du JSON de sortie…'));

  const output: GameAnalysisResult = {
    ...result,
    fichier: path.resolve(filePath!),
  };

  fs.mkdirSync(path.dirname(path.resolve(outputPath!)), { recursive: true });
  fs.writeFileSync(outputPath!, JSON.stringify(output, null, 2), 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(chalk.green(`   ✔ Résultats écrits dans : ${outputPath}\n`));
  console.log(chalk.bold.green('══════════════════════════════════════════════════════'));
  console.log(chalk.bold.green(`   Analyse terminée en ${elapsed}s`));
  console.log(chalk.bold.green('══════════════════════════════════════════════════════\n'));

  // ── Aperçu console ──────────────────────────────────────────────────────────
  console.log(chalk.bold(`Jeu : ${result.jeu}`));
  const m = result.metadata;
  if (m.joueurs_min !== null) {
    console.log(chalk.gray(`Joueurs : ${m.joueurs_min}–${m.joueurs_max} | Âge : ${m.age_minimum}+ | Durée : ${m.duree_minutes_min}–${m.duree_minutes_max} min`));
  }

  const typeColors: Record<string, chalk.Chalk> = {
    materiel: chalk.magenta, preparation: chalk.blue, tour_de_jeu: chalk.cyan,
    victoire: chalk.yellow, variante: chalk.gray, regles_speciales: chalk.red,
    presentation: chalk.white, but_du_jeu: chalk.green, conseils: chalk.gray,
    cartes_evenement: chalk.cyan, autre: chalk.white,
  };

  console.log(chalk.bold('\nSections :'));
  result.sections.forEach((s, i) => {
    const color = typeColors[s.type_section] ?? chalk.white;
    console.log(color(`  [${i + 1}] ${s.titre}`) + chalk.gray(` [${s.type_section}]`));
    if (s.mecaniques.length > 0) {
      console.log(chalk.gray('       ↳ ') + s.mecaniques.join(', '));
    }
  });

  const mecas: GameMechanic[] = result.statistiques.mecaniques_detectees;
  console.log('\n' + chalk.bold('Mécaniques : ') + mecas.join(', '));
  console.log('');
}

run().catch(err => {
  console.error(chalk.red(`\n✖  Erreur fatale : ${err instanceof Error ? err.message : String(err)}`));
  if (err instanceof Error) console.error(chalk.gray(err.stack ?? ''));
  process.exit(1);
});
