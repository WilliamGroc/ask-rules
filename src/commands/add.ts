/**
 * add.ts — Commande : indexation d'un fichier de règles dans la knowledge base
 *
 * Usage :
 *   ts-node src/index.ts add <fichier.txt|pdf> [--embed] [--kb <chemin>]
 *
 * Exemples :
 *   ts-node src/index.ts add data/regles.txt
 *   ts-node src/index.ts add data/regles.pdf --embed
 *   ts-node src/index.ts add data/autre_jeu.txt --kb data/ma-base.json
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

import { analyseFile } from '../pipeline';
import { buildVector } from '../modules/retriever';
import { loadKB, saveKB, upsertEntry, slugify, summarizeKB, KB_DEFAULT_PATH }
  from '../modules/knowledgeBase';
import type { KnowledgeBaseEntry, StoredSection } from '../types';

export async function runAdd(argv: string[]): Promise<void> {
  const filePath = argv.find(a => !a.startsWith('--'));
  const withEmbed = argv.includes('--embed');
  const kbFlag = argv.indexOf('--kb');
  const kbPath = kbFlag !== -1 ? argv[kbFlag + 1] : KB_DEFAULT_PATH;

  if (!filePath) {
    console.error(chalk.red('✖  Erreur : chemin du fichier manquant.'));
    console.error(chalk.gray('   Usage : ts-node src/index.ts add <fichier.txt|pdf> [--embed] [--kb chemin.json]'));
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`✖  Fichier introuvable : ${filePath}`));
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  const startTime = Date.now();

  console.log(chalk.bold.cyan('\n══════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('   Indexation dans la Knowledge Base                  '));
  console.log(chalk.bold.cyan('══════════════════════════════════════════════════════\n'));
  console.log(chalk.blue(`📄 Fichier : ${filePath}`));
  console.log(chalk.blue(`💾 Base KB : ${kbPath}\n`));

  // ── Étape 1 : Analyse du fichier ────────────────────────────────────────────
  console.log(chalk.yellow('▶ Étape 1/3 — Analyse NLP…'));
  let sectionsDone = 0;

  const result = await analyseFile(absPath, {
    withEmbed,
    onSection: (_i, total, titre) => {
      sectionsDone++;
      process.stdout.write(chalk.gray(`   ${sectionsDone}/${total} "${titre}"…\r`));
    },
  });

  process.stdout.write(' '.repeat(80) + '\r');
  console.log(chalk.green(`   ✔ "${result.jeu}" — ${result.statistiques.sections} section(s)\n`));

  // ── Étape 2 : Vectorisation TF-IDF ──────────────────────────────────────────
  console.log(chalk.yellow('▶ Étape 2/3 — Vectorisation TF-IDF des sections…'));

  const gameSlug = slugify(result.jeu);
  const storedSections: StoredSection[] = result.sections.map((section, i) => ({
    ...section,
    section_id: `${gameSlug}_${i}`,
    tfidf_vector: buildVector(section.contenu),
  }));

  console.log(chalk.green(`   ✔ ${storedSections.length} vecteur(s) calculé(s)\n`));

  // ── Étape 3 : Sauvegarde dans la KB ─────────────────────────────────────────
  console.log(chalk.yellow('▶ Étape 3/3 — Mise à jour de la base de connaissance…'));

  const kb = loadKB(kbPath);
  const isUpdate = kb.games.some(g => g.id === gameSlug);

  const entry: KnowledgeBaseEntry = {
    id: gameSlug,
    jeu: result.jeu,
    fichier: absPath,
    date_ajout: new Date().toISOString(),
    metadata: result.metadata,
    statistiques: result.statistiques,
    sections: storedSections,
  };

  upsertEntry(kb, entry);
  saveKB(kb, kbPath);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(chalk.green(`   ✔ ${isUpdate ? 'Mis à jour' : 'Ajouté'} : "${result.jeu}"\n`));
  console.log(chalk.bold.green('══════════════════════════════════════════════════════'));
  console.log(chalk.bold.green(`   Indexation terminée en ${elapsed}s`));
  console.log(chalk.bold.green('══════════════════════════════════════════════════════\n'));
  console.log(chalk.bold('État de la base :') + ' ' + summarizeKB(kb));

  // Résumé des mécaniques détectées
  const mecas = result.statistiques.mecaniques_detectees;
  if (mecas.length > 0) {
    console.log(chalk.gray('Mécaniques     : ') + mecas.join(', '));
  }
  const meta = result.metadata;
  if (meta.joueurs_min !== null) {
    console.log(chalk.gray('Joueurs        : ') + `${meta.joueurs_min}–${meta.joueurs_max}`);
  }
  console.log('');
}
