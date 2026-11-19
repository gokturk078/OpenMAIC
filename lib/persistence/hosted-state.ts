import { getServerPersistenceProvider } from './server-provider';

async function initialize() {
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':hosted-state',0))",
    );
    await connection.query(`
      CREATE TABLE IF NOT EXISTS hosted_position (
        stage_id text PRIMARY KEY REFERENCES stage_meta(stage_id) ON DELETE CASCADE,
        scene_id text, updated_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hosted_usage (
        seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        month text NOT NULL, record jsonb NOT NULL
      );
      CREATE INDEX IF NOT EXISTS hosted_usage_month_idx ON hosted_usage(month);
    `);
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
  return pool;
}

let ready: ReturnType<typeof initialize> | undefined;
export function hostedState() {
  return (ready ??= initialize().catch((error) => {
    ready = undefined;
    throw error;
  }));
}
