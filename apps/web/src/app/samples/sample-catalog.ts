/** What the app shows about a bundled sample. The analysis itself is in `public/samples/<id>.json`. */
export interface SampleInfo {
  id: string;
  name: string;
  description: string;
  /** Bundled samples link to their source; an analysed local folder has none. */
  repository?: string;
  license?: string;
  /** The node the overview suggests clicking first: a widely used service. */
  suggestedNode: string;
}

/** Keep in step with `tools/cli/src/samples.ts`, which produces the JSON. */
export const SAMPLE_CATALOG: readonly SampleInfo[] = [
  {
    id: 'realworld',
    name: 'Angular RealWorld',
    description: 'Conduit, a Medium-style blogging app: articles, profiles, comments and auth.',
    repository: 'https://github.com/gothinkster/angular-realworld-example-app',
    license: 'MIT',
    suggestedNode: 'UserService',
  },
];

export const DEFAULT_SAMPLE_ID = SAMPLE_CATALOG[0]!.id;
