import type { SystemRenderer, SystemRendererEvents } from '../renderer/system-renderer';

/** Records what Angular asks the scene to do, without WebGL. */
export class FakeRenderer implements SystemRenderer {
  static instances: FakeRenderer[] = [];
  events?: SystemRendererEvents;
  initialized = 0;
  disposed = 0;
  focused: (string | null)[] = [];
  highlighted: ReadonlySet<string> = new Set();
  edges: ReadonlySet<string> = new Set();

  constructor() {
    FakeRenderer.instances.push(this);
  }
  initialize(_: HTMLElement, events: SystemRendererEvents) {
    this.initialized++;
    this.events = events;
  }
  setGraph() {
    /* not needed */
  }
  focusNode(id: string | null) {
    this.focused.push(id);
  }
  highlightNodes(ids: ReadonlySet<string>) {
    this.highlighted = ids;
  }
  showEdges(ids: ReadonlySet<string>) {
    this.edges = ids;
  }
  setReducedMotion() {
    /* not needed */
  }
  setRightInset() {
    /* not needed */
  }
  resize() {
    /* not needed */
  }
  dispose() {
    this.disposed++;
  }
}
