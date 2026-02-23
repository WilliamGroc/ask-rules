/**
 * add.ts — Commande : indexation d'un fichier de règles dans la knowledge base (PostgreSQL)
 *
 * Usage :
 *   tsx src/index.ts add <fichier.txt|pdf> [--merge]
 *
 * Exemples :
 *   tsx src/index.ts add data/regles.txt
 *   tsx src/index.ts add data/extension.pdf --merge   → ajoute au jeu existant
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

import { analyseFile } from '../pipeline';
import { generateEmbedding } from '../modules/embedder';
import { upsertGame, gameExists, mergeGame, countSections, slugify, summarizeKB } from '../modules/knowledgeBase';
import pool from '../modules/db';
import type { KnowledgeBaseEntry, StoredSection } from '../types';

export async function runAdd(argv: string[]): Promise<void> {
  const filePath = argv.find(a => !a.startsWith('--'));
  const mergeFlag = argv.includes('--merge');

  if (!filePath) {
    console.error(chalk.red('✖  Erreur : chemin du fichier manquant.'));
    console.error(chalk.gray('   Usage : tsx src/index.ts add <fichier.txt|pdf> [--merge]'));
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`✖  Fichier introuvable : ${filePath}`));
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  const startTime = Date.now();

  console.log(chalk.bold.cyan('\n══════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('   Indexation dans la Knowledge Base (PostgreSQL)      '));
  console.log(chalk.bold.cyan('══════════════════════════════════════════════════════\n'));
  console.log(chalk.blue(`📄 Fichier : ${filePath}\n`));

  // ── Étape 1 : Analyse NLP ────────────────────────────────────────────────────
  console.log(chalk.yellow('▶ Étape 1/3 — Analyse NLP…'));
  let sectionsDone = 0;

  const result = await analyseFile(absPath, {
    withEmbed: false,
    onSection: (_i, total, titre) => {
      sectionsDone++;
      process.stdout.write(chalk.gray(`   ${sectionsDone}/${total} "${titre}"…\r`));
    },
  });

  process.stdout.write(' '.repeat(80) + '\r');
  console.log(chalk.green(`   ✔ "${result.jeu}" — ${result.statistiques.sections} section(s)\n`));

  // ── Étape 2 : Génération des embeddings ──────────────────────────────────────
  console.log(chalk.yellow('▶ Étape 2/3 — Génération des embeddings (384 dims)…'));

  const gameSlug = slugify(result.jeu);
  const alreadyExists = await gameExists(gameSlug);

  // En mode fusion, on décale les IDs pour éviter les collisions avec les sections existantes
  const isMerge = mergeFlag && alreadyExists;
  const idOffset = isMerge ? await countSections(gameSlug) : 0;

  if (mergeFlag && !alreadyExists) {
    console.log(chalk.gray(`   (--merge ignoré : "${result.jeu}" n'existe pas encore, ajout normal)\n`));
  }

  const storedSections: StoredSection[] = [];

  for (let i = 0; i < result.sections.length; i++) {
    const section = result.sections[i];
    process.stdout.write(chalk.gray(`   ${i + 1}/${result.sections.length} "${section.titre}"…\r`));

    const embedding = await generateEmbedding(section.contenu);

    storedSections.push({
      ...section,
      section_id: `${gameSlug}_${idOffset + i}`,
      embedding,
    });
  }

  process.stdout.write(' '.repeat(80) + '\r');
  console.log(chalk.green(`   ✔ ${storedSections.length} embedding(s) généré(s)\n`));

  // ── Étape 3 : Sauvegarde PostgreSQL ──────────────────────────────────────────
  console.log(chalk.yellow('▶ Étape 3/3 — Sauvegarde en base de données…'));

  const entry: KnowledgeBaseEntry = {
    id: gameSlug,
    jeu: result.jeu,
    fichier: absPath,
    date_ajout: new Date().toISOString(),
    metadata: result.metadata,
    statistiques: result.statistiques,
    sections: storedSections,
  };

  if (isMerge) {
    await mergeGame(entry);
  } else {
    await upsertGame(entry);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  const actionLabel = isMerge
    ? `Fusionné (+${storedSections.length} sections) : "${result.jeu}"`
    : alreadyExists
      ? `Remplacé : "${result.jeu}"`
      : `Ajouté : "${result.jeu}"`;

  console.log(chalk.green(`   ✔ ${actionLabel}\n`));
  console.log(chalk.bold.green('══════════════════════════════════════════════════════'));
  console.log(chalk.bold.green(`   Indexation terminée en ${elapsed}s`));
  console.log(chalk.bold.green('══════════════════════════════════════════════════════\n'));

  const summary = await summarizeKB();
  console.log(chalk.bold('État de la base :') + ' ' + summary);

  const mecas = result.statistiques.mecaniques_detectees;
  if (mecas.length > 0) {
    console.log(chalk.gray('Mécaniques     : ') + mecas.join(', '));
  }
  const meta = result.metadata;
  if (meta.joueurs_min !== null) {
    console.log(chalk.gray('Joueurs        : ') + `${meta.joueurs_min}–${meta.joueurs_max}`);
  }
  console.log('');

  await pool.end();
}
