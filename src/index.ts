/**
 * index.ts — Point d'entrée CLI unifié
 *
 * Commandes disponibles :
 *
 *   add   <fichier>
 *     Analyse un fichier de règles et l'indexe dans PostgreSQL (pgvector).
 *
 *   ask   "question" [--top N] [--jeu <nom>]
 *     Pose une question à la knowledge base (+ LLM si clé API disponible).
 *
 *   analyse <fichier> [--embed] [--output <chemin>]
 *     Analyse standalone : produit uniquement un JSON de résultat.
 *
 * Exemples :
 *   ts-node src/index.ts add data/regles.txt
 *   ts-node src/index.ts ask "Comment se déroule un combat ?"
 *   ts-node src/index.ts ask "Quelles ressources existe-t-il ?" --top 5
 *   MISTRAL_API_KEY=... ts-node src/index.ts ask "Comment gagner ?"
 */

import 'dotenv/config';
import chalk from 'chalk';
import { runAdd } from './commands/add';
import { runAsk } from './commands/ask';

const HELP = `
${chalk.bold.cyan('Analyseur de Règles de Jeu de Société')}

${chalk.bold('COMMANDES :')}

  ${chalk.green('add')} <fichier.txt|pdf> [--merge]
    Analyse et indexe un fichier de règles dans PostgreSQL (pgvector).
    Les embeddings denses (384 dims) sont générés automatiquement.
    Options :
      --merge   Ajoute les sections au jeu existant sans l'écraser
                (utile pour indexer une extension ou un second PDF)

  ${chalk.green('ask')} "question" [options]
    Pose une question à la base de connaissance (RAG + LLM optionnel).
    Options :
      --top <N>       Nombre de sections à récupérer (défaut : 4)
      --jeu <nom>     Cibler un jeu spécifique par son nom

  ${chalk.green('analyse')} <fichier.txt|pdf> [options]
    Analyse standalone sans indexation (produit resultat.json).
    Options :
      --embed            Génère des embeddings
      --output <chemin>  Fichier de sortie JSON

${chalk.bold('VARIABLES D\'ENVIRONNEMENT :')}

  DATABASE_URL      Connexion PostgreSQL (défaut : postgresql://postgres@localhost:5432/ask_rules)
  MISTRAL_API_KEY   Clé API Mistral (active l'assistant pour ask)
  OPENAI_API_KEY    Clé API OpenAI (active gpt-4o-mini pour ask)
  OLLAMA_MODEL      Nom du modèle Ollama local (ex: llama3, mistral)
  OLLAMA_HOST       URL Ollama (défaut : http://localhost:11434)

${chalk.bold('DÉMARRAGE :')}

  pnpm run migrate   Initialise le schéma PostgreSQL (à faire une seule fois)
  pnpm run add data/regles.txt
  pnpm run ask "Combien de joueurs peuvent jouer ?"
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
