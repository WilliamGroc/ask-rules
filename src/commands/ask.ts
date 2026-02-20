/**
 * ask.ts — Commande : poser une question à la knowledge base / LLM
 *
 * Usage :
 *   ts-node src/index.ts ask "Combien de joueurs ?" [--top 4] [--kb <chemin>] [--jeu <nom>]
 *
 * Exemples :
 *   ts-node src/index.ts ask "Comment fonctionne un combat ?"
 *   ts-node src/index.ts ask "Combien de tuiles ?" --jeu "Châteaux de Bourgogne"
 *   ts-node src/index.ts ask "Comment gagner ?" --top 5
 */

import chalk from 'chalk';
import { retrieveFromBestGame } from '../modules/retriever';
import { queryLLM } from '../modules/llmClient';
import { loadKB, summarizeKB, KB_DEFAULT_PATH } from '../modules/knowledgeBase';
import type { ScoredSection } from '../types';
import type { GameSelection } from '../modules/retriever';

// ── Formatage du contexte ─────────────────────────────────────────────────────

function formatContext(results: ScoredSection[], maxCharsPerSection = 800): string {
  return results
    .map((r, i) => {
      const content = r.section.contenu.length > maxCharsPerSection
        ? r.section.contenu.slice(0, maxCharsPerSection) + '…'
        : r.section.contenu;

      return [
        `--- Section ${i + 1} : "${r.section.titre}" [${r.section.type_section}]`,
        content,
      ].join('\n');
    })
    .join('\n\n');
}

function printSections(results: ScoredSection[]): void {
  results.forEach((r, i) => {
    const score = (r.score * 100).toFixed(0);
    console.log(
      chalk.cyan(`\n  [${i + 1}] ${r.section.titre}`) +
      chalk.gray(` [score : ${score}%]  niv.${r.section.niveau}`),
    );
    if (r.section.mecaniques.length > 0) {
      console.log(chalk.gray('      Mécaniques : ') + r.section.mecaniques.join(', '));
    }
    console.log(chalk.gray('      Résumé : ') +
      (r.section.resume || r.section.contenu.slice(0, 150) + '…'));
  });
}

// ── Sélection manuelle du jeu (--jeu) ────────────────────────────────────────

/**
 * Filtre la KB pour ne conserver que le jeu dont le nom contient la chaîne donnée
 * puis appelle retrieveFromBestGame sur cette KB réduite.
 */
function retrieveForGame(
  gameName: string,
  question: string,
  kb: ReturnType<typeof loadKB>,
  topN: number,
): GameSelection | null {
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const needle = normalize(gameName);
  const match  = kb.games.find(g => normalize(g.jeu).includes(needle));

  if (!match) return null;

  const reduced = { ...kb, games: [match] };
  return retrieveFromBestGame(question, reduced, topN, 0.01);
}

// ── Commande principale ───────────────────────────────────────────────────────

export async function runAsk(argv: string[]): Promise<void> {
  // Parse des arguments
  const topFlag = argv.indexOf('--top');
  const topN    = topFlag !== -1 ? parseInt(argv[topFlag + 1] ?? '4', 10) : 4;

  const kbFlag  = argv.indexOf('--kb');
  const kbPath  = kbFlag !== -1 ? argv[kbFlag + 1] : KB_DEFAULT_PATH;

  const jeuFlag = argv.indexOf('--jeu');
  const jeuFilter = jeuFlag !== -1 ? argv[jeuFlag + 1] : null;

  // La question = args qui ne sont pas des flags ni leurs valeurs
  const flagsWithValues = new Set<number>();
  ['--top', '--kb', '--jeu'].forEach(f => {
    const idx = argv.indexOf(f);
    if (idx !== -1) { flagsWithValues.add(idx); flagsWithValues.add(idx + 1); }
  });

  const question = argv
    .filter((_, i) => !flagsWithValues.has(i) && !argv[i].startsWith('--'))
    .join(' ')
    .trim();

  if (!question) {
    console.error(chalk.red('✖  Erreur : question manquante.'));
    console.error(chalk.gray('   Usage : ts-node src/index.ts ask "votre question"'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan('\n══════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('   Question à la Knowledge Base                       '));
  console.log(chalk.bold.cyan('══════════════════════════════════════════════════════\n'));
  console.log(chalk.bold('❓ Question : ') + question + '\n');

  // ── Chargement de la KB ─────────────────────────────────────────────────────
  const kb = loadKB(kbPath);

  if (kb.games.length === 0) {
    console.error(chalk.red('✖  La base de connaissance est vide.'));
    console.error(chalk.gray('   Ajoutez d\'abord un fichier : ts-node src/index.ts add <fichier>'));
    process.exit(1);
  }

  console.log(chalk.gray(`🗄️  Base KB : ${summarizeKB(kb)} (${kbPath})\n`));

  // ── Récupération sémantique + sélection du jeu ──────────────────────────────
  console.log(chalk.yellow(`🔍 Sélection du jeu pertinent et recherche des ${topN} sections…`));

  let selection: GameSelection | null;

  if (jeuFilter) {
    // Sélection manuelle via --jeu
    selection = retrieveForGame(jeuFilter, question, kb, topN);
    if (!selection) {
      console.error(chalk.red(`✖  Aucun jeu correspondant à "${jeuFilter}" dans la KB.`));
      console.error(chalk.gray('   Jeux disponibles : ' + kb.games.map(g => g.jeu).join(', ')));
      process.exit(1);
    }
    console.log(chalk.blue(`🎲 Jeu ciblé (--jeu) : ${chalk.bold(selection.jeu)}\n`));
  } else {
    selection = retrieveFromBestGame(question, kb, topN);
    if (!selection) {
      console.log(chalk.red('\n  Aucune section pertinente trouvée pour cette question.'));
      console.log(chalk.gray('  Essayez des mots-clés différents ou précisez avec --jeu.<nom_du_jeu>\n'));
      return;
    }

    const reason = selection.matchedName
      ? chalk.blue('(nom mentionné dans la question)')
      : chalk.gray(`(score agrégé : ${(selection.relevanceScore * 100).toFixed(0)}%)`);

    console.log(`🎲 Jeu sélectionné : ${chalk.bold.blue(selection.jeu)} ${reason}\n`);
  }

  if (selection.sections.length === 0) {
    console.log(chalk.red('\n  Aucune section pertinente trouvée dans ce jeu.'));
    console.log(chalk.gray('  Essayez des mots-clés différents ou --jeu <autre_jeu>.\n'));
    return;
  }

  console.log(chalk.green(`📚 ${selection.sections.length} section(s) trouvée(s) :\n`));
  printSections(selection.sections);

  // ── Génération LLM ──────────────────────────────────────────────────────────
  const context = formatContext(selection.sections);
  const startLLM = Date.now();

  console.log(chalk.yellow(`\n\n🤖 Génération de la réponse…`));

  let llmResult;
  try {
    llmResult = await queryLLM(question, context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n✖  Erreur LLM : ${msg}`));
    process.exit(1);
  }

  const elapsed = ((Date.now() - startLLM) / 1000).toFixed(2);

  console.log(chalk.bold.green('\n══════════════════════════════════════════════════════'));

  if (llmResult.used_llm) {
    console.log(chalk.bold.green(`   Réponse (${llmResult.model}) — ${elapsed}s`));
    console.log(chalk.bold.green('══════════════════════════════════════════════════════\n'));
    console.log(llmResult.answer);
  } else {
    console.log(chalk.bold.yellow('   Mode sans LLM — sections pertinentes retournées'));
    console.log(chalk.bold.green('══════════════════════════════════════════════════════'));
    console.log(chalk.gray('\n  Pour activer un LLM, définissez l\'une de ces variables :'));
    console.log(chalk.gray('    MISTRAL_API_KEY=...      (Mistral AI)'));
    console.log(chalk.gray('    OPENAI_API_KEY=sk-...    (OpenAI gpt-4o-mini)'));
    console.log(chalk.gray('    OLLAMA_MODEL=llama3       (Ollama local, port 11434)'));
  }

  console.log('');
}
