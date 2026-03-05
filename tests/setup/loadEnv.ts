import { join } from 'node:path';

import { loadEnvFile } from '../../src/cli/envLoader.js';

loadEnvFile(join(process.cwd(), '.env'));
