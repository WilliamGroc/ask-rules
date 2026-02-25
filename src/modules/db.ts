/**
 * db.ts
 * Pool de connexion PostgreSQL partagé pour l'application.
 *
 * Configuration via variables d'environnement :
 *   DATABASE_URL=postgresql://user:password@host:5432/dbname
 * Ou valeurs par défaut : postgres@localhost:5432/ask_rules
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://postgres@localhost:5432/ask_rules',
});

export default pool;
