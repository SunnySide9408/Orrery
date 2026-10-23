import { NODE_KINDS } from '@orrery/contracts';
import { KIND_STYLES } from './kind-style';
import { FAMILY_INDEX, hashString, planetLook, starColor } from './planet-look';

describe('planetLook', () => {
  it('gives the same look for the same file every time', () => {
    const a = planetLook('src/app/core/auth/user.service.ts', 'service');
    const b = planetLook('src/app/core/auth/user.service.ts', 'service');
    expect(a).toEqual(b);
  });

  it('gives different files of one kind different looks', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `src/app/feature-${i}/thing.component.ts`);
    const seeds = new Set(
      ids.map((id) =>
        planetLook(id, 'component')
          .seed.map((n) => n.toFixed(3))
          .join(','),
      ),
    );
    expect(seeds.size).toBe(ids.length);
  });

  it('keeps every seed number in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      for (const n of planetLook(`file-${i}.ts`, 'other').seed) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
      }
    }
  });

  it('picks the family from the kind, and rings only services', () => {
    for (const kind of NODE_KINDS) {
      const look = planetLook('x.ts', kind);
      expect(look.family).toBe(FAMILY_INDEX[KIND_STYLES[kind].family]);
      expect(look.ringed).toBe(kind === 'service');
    }
  });
});

describe('kind styles', () => {
  it('give every kind a marker, and kinds with the same marker different colours', () => {
    const seen = new Map<string, string>();
    for (const kind of NODE_KINDS) {
      const { marker, color } = KIND_STYLES[kind];
      const key = `${marker}:${color}`;
      expect(seen.has(key), `${kind} looks like ${seen.get(key)}`).toBe(false);
      seen.set(key, kind);
    }
  });
});

describe('starColor', () => {
  it('is stable per region', () => {
    expect(starColor('lazy-route:src/app/features/article')).toEqual(
      starColor('lazy-route:src/app/features/article'),
    );
  });
});

describe('hashString', () => {
  it('matches the FNV-1a reference value', () => {
    expect(hashString('a')).toBe(0xe40c292c);
  });
});
