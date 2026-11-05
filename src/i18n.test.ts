import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from './i18n.ts';

describe('i18n', () => {
  it('has the same keys in every language', () => {
    const [first, ...rest] = Object.values(DICTIONARIES).map((d) => Object.keys(d).sort());
    for (const keys of rest) expect(keys).toEqual(first);
  });
});
