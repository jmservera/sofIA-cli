/**
 * Loads a `.env` file into `process.env` without overwriting existing values.
 *
 * Called at CLI startup so that variables written by `infra/deploy.sh`
 * (e.g. `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME`) are
 * available to the application automatically.
 */
import { config } from 'dotenv';

/**
 * Load environment variables from the given `.env` file path.
 * Variables already present in `process.env` are **not** overwritten.
 * If the file does not exist the call is a silent no-op.
 */
export function loadEnvFile(envPath: string): void {
  config({ path: envPath, override: false, quiet: true });
}
