import { describe, expect, it } from 'vitest';

import liveConfig from '../../../vitest.live.config';
import defaultConfig from '../../../vitest.config';

type VitestLikeConfig = {
  test?: {
    setupFiles?: string[];
  };
};

describe('Vitest env setup', () => {
  it('declares a setup file for default tests', () => {
    const config = defaultConfig as VitestLikeConfig;

    expect(config.test?.setupFiles).toContain('tests/setup/loadEnv.ts');
  });

  it('declares a setup file for live tests', () => {
    const config = liveConfig as VitestLikeConfig;

    expect(config.test?.setupFiles).toContain('tests/setup/loadEnv.ts');
  });
});
