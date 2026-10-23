/** A public Angular app that ships with Orrery, pre-analysed at build time. */
export interface SampleSource {
  id: string;
  /** Shown in the app. */
  name: string;
  repository: string;
  /** Pinned commit, so the shipped JSON can be regenerated exactly. */
  commit: string;
  /** Folders to analyse, relative to the repository root. */
  include: readonly string[];
  license: string;
}

export const SAMPLES: readonly SampleSource[] = [
  {
    id: 'realworld',
    name: 'Angular RealWorld (Conduit)',
    repository: 'https://github.com/gothinkster/angular-realworld-example-app',
    commit: 'dd99ed2cf39c805d719f943c5d7061a5683d98a8',
    include: ['src'],
    license: 'MIT',
  },
];
