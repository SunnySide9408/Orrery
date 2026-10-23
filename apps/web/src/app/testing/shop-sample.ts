import { shopFixture } from '@orrery/fixture-shop';
import { prepareSample, type LoadedSample } from '../samples/loaded-sample';

/** The hand-written Phase 0 fixture, prepared exactly as a fetched sample would be. */
export function shopSample(): LoadedSample {
  return prepareSample(
    {
      id: 'shop',
      name: 'Shop fixture',
      description: 'Hand-written test fixture.',
      repository: 'https://example.com/shop',
      license: 'MIT',
      suggestedNode: 'AuthService',
    },
    structuredClone(shopFixture),
  );
}
