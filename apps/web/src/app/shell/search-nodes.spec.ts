import { shopFixture } from '@orrery/fixture-shop';
import { searchNodes } from './search-nodes';

const { nodes, regions } = shopFixture.graph;
const names = (query: string) => searchNodes(nodes, regions, query).map((hit) => hit.node.name);

describe('searchNodes', () => {
  it('returns nothing for an empty query', () => {
    expect(names('  ')).toEqual([]);
  });

  it('puts names that start with the query first', () => {
    expect(names('authser')[0]).toBe('AuthService');
    expect(names('guard')).toContain('authGuard');
  });

  it('matches every word against name, path, kind and region', () => {
    const hits = searchNodes(nodes, regions, 'checkout component');
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.regionLabel).toBe('checkout');
      expect(hit.node.kind).toBe('component');
    }
  });

  it('leaves specs out', () => {
    expect(searchNodes(nodes, regions, 'spec').every((hit) => hit.node.kind !== 'spec')).toBe(true);
  });

  it('caps the number of hits', () => {
    expect(searchNodes(nodes, regions, 'src', 5)).toHaveLength(5);
  });
});
