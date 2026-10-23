import { describe, expect, it } from 'vitest';
import { findCycles, shortestCycle } from './cycles';
import { createGraphIndex } from './graph-index';
import { graphOf } from './testing';

describe('findCycles', () => {
  const index = createGraphIndex(
    graphOf([
      // One loop of three, with a shortcut back: a → b → c → a and c → b.
      ['import', 'a.ts', 'b.ts'],
      ['import', 'b.ts', 'c.ts'],
      ['import', 'c.ts', 'a.ts'],
      ['import', 'c.ts', 'b.ts'],
      // A separate pair.
      ['import', 'x.ts', 'y.ts'],
      ['inject', 'y.ts', 'x.ts'],
      // No cycle.
      ['import', 'a.ts', 'z.ts'],
    ]),
  );

  it('returns each strongly connected component with more than one node, sorted', () => {
    expect(findCycles(index)).toEqual([
      ['a.ts', 'b.ts', 'c.ts'],
      ['x.ts', 'y.ts'],
    ]);
  });

  it('can leave nodes out, which breaks the cycles through them', () => {
    expect(findCycles(index, (id) => id !== 'x.ts')).toEqual([['a.ts', 'b.ts', 'c.ts']]);
  });

  it('handles long chains without recursion', () => {
    const edges: ['import', string, string][] = [];
    for (let i = 0; i < 20_000; i++) edges.push(['import', `n${i}.ts`, `n${i + 1}.ts`]);
    edges.push(['import', 'n20000.ts', 'n0.ts']);
    const [component] = findCycles(createGraphIndex(graphOf(edges)));
    expect(component).toHaveLength(20_001);
  });
});

describe('shortestCycle', () => {
  it('finds the shortest loop through the first node of the component', () => {
    const index = createGraphIndex(
      graphOf([
        ['import', 'a.ts', 'b.ts'],
        ['import', 'b.ts', 'c.ts'],
        ['import', 'c.ts', 'd.ts'],
        ['import', 'd.ts', 'a.ts'],
        ['import', 'b.ts', 'a.ts'],
      ]),
    );
    expect(shortestCycle(index, ['a.ts', 'b.ts', 'c.ts', 'd.ts'])).toEqual([
      'a.ts',
      'b.ts',
      'a.ts',
    ]);
  });

  it('stays inside the component', () => {
    const index = createGraphIndex(
      graphOf([
        ['import', 'a.ts', 'b.ts'],
        ['import', 'b.ts', 'out.ts'],
        ['import', 'out.ts', 'a.ts'],
        ['import', 'b.ts', 'c.ts'],
        ['import', 'c.ts', 'a.ts'],
      ]),
    );
    expect(shortestCycle(index, ['a.ts', 'b.ts', 'c.ts'])).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
      'a.ts',
    ]);
  });
});
