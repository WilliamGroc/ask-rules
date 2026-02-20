/**
 * index.ts — Point d'entrée CLI unifié
 *
 * Commandes disponibles :
 *
 *   add   <fichier>  [--embed] [--kb <chemin>]
 *     Analyse un fichier de règles et l'indexe dans la knowledge base.
 *
 *   ask   "question" [--top N]  [--kb <chemin>]
 *     Pose une question à la knowledge base (+ LLM si clé API disponible).
 *
 *   analyse <fichier> [--embed] [--output <chemin>]
 *     Analyse standalone : produit uniquement un JSON de résultat.
 *
 * Exemples :
 *   ts-node src/index.ts add data/regles.txt
 *   ts-node src/index.ts ask "Comment se déroule un combat ?"
 *   ts-node src/index.ts ask "Quelles ressources existe-t-il ?" --top 5
 *   OPENAI_API_KEY=sk-... ts-node src/index.ts ask "Comment gagner ?"
 */

import 'dotenv/config';
import chalk from 'chalk';
import { runAdd } from './commands/add';
import { runAsk } from './commands/ask';

const HELP = `
${chalk.bold.cyan('Analyseur de Règles de Jeu de Société')}

${chalk.bold('COMMANDES :')}

  ${chalk.green('add')} <fichier.txt|pdf> [options]
    Analyse et indexe un fichier de règles dans la base de connaissance.
    Options :
      --embed         Génère aussi un embedding dense (OpenAI ou TF-IDF)
      --kb <chemin>   Chemin vers la KB (défaut : data/knowledge-base.json)

  ${chalk.green('ask')} "question" [options]
    Pose une question à la base de connaissance (RAG + LLM optionnel).
    Options :
      --top <N>       Nombre de sections à récupérer (défaut : 4)
      --kb <chemin>   Chemin vers la KB (défaut : data/knowledge-base.json)

  ${chalk.green('analyse')} <fichier.txt|pdf> [options]
    Analyse standalone sans indexation (produit resultat.json).
    Options :
      --embed            Génère des embeddings
      --output <chemin>  Fichier de sortie JSON

${chalk.bold('VARIABLES D\'ENVIRONNEMENT :')}

  OPENAI_API_KEY    Clé API OpenAI (active gpt-4o-mini pour ask)
  OLLAMA_MODEL      Nom du modèle Ollama local (ex: llama3, mistral)
  OLLAMA_HOST       URL Ollama (défaut : http://localhost:11434)

${chalk.bold('EXEMPLES :')}

  pnpm run add
  pnpm run ask "Combien de joueurs peuvent jouer ?"
  OPENAI_API_KEY=sk-... pnpm run ask "Comment fonctionne un combat ?"
`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'add':
      await runAdd(rest);
      break;

    case 'ask':
      await runAsk(rest);
      break;

    case 'analyse': {
      // Délègue vers analyser.ts (standalone, sans indexation)
      // On recréé les argv pour analyser.ts qui lit process.argv
      process.argv = [process.argv[0], process.argv[1], ...rest];
      await import('./analyser');
      break;
    }

    case '--help':
    case '-h':
    case 'help':
    case undefined:
      console.log(HELP);
      break;

    default:
      console.error(chalk.red(`✖  Commande inconnue : "${cmd}"`));
      console.log(HELP);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(chalk.red(`\n✖  Erreur : ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
