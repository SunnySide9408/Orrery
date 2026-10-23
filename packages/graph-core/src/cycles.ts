import type { GraphIndex } from './graph-index';

/**
 * Strongly connected components with more than one node: groups of files
 * where each one can reach every other one by following dependencies, so each
 * group holds at least one cycle. Tarjan's algorithm, written without
 * recursion so a long chain of imports cannot overflow the stack.
 *
 * Each component is sorted by ID, and the list by its first ID, so the output
 * does not depend on the order of the input.
 */
export function findCycles(
  index: GraphIndex,
  include: (nodeId: string) => boolean = () => true,
): string[][] {
  const ids = index.graph.nodes
    .map((node) => node.id)
    .filter(include)
    .sort(compare);
  const successors = (id: string) => index.dependenciesOf(id).filter(include);

  let counter = 0;
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  for (const start of ids) {
    if (order.has(start)) continue;
    // Each frame is a node and the position of the next successor to visit.
    const frames: { id: string; next: number }[] = [];
    const open = (id: string) => {
      order.set(id, counter);
      low.set(id, counter);
      counter++;
      stack.push(id);
      onStack.add(id);
      frames.push({ id, next: 0 });
    };
    open(start);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const next = successors(frame.id)[frame.next++];
      if (next !== undefined) {
        if (!order.has(next)) {
          open(next);
        } else if (onStack.has(next)) {
          low.set(frame.id, Math.min(low.get(frame.id)!, order.get(next)!));
        }
        continue;
      }

      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) low.set(parent.id, Math.min(low.get(parent.id)!, low.get(frame.id)!));
      if (low.get(frame.id) === order.get(frame.id)) {
        const component: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.id);
        if (component.length > 1) components.push(component.sort(compare));
      }
    }
  }

  return components.sort((a, b) => compare(a[0]!, b[0]!));
}

/**
 * A shortest cycle through the first node of a component, staying inside it:
 * `[a, b, c, a]`, where each step is "depends on". Used as the evidence for a
 * cycle finding, because a short loop is the easiest one to check by hand.
 */
export function shortestCycle(index: GraphIndex, component: readonly string[]): string[] {
  const members = new Set(component);
  const start = component[0]!;
  const previous = new Map<string, string>();
  const queue = [start];
  // An array iterator also visits items pushed during the loop, so this is a queue.
  for (const current of queue) {
    for (const next of index.dependenciesOf(current)) {
      if (!members.has(next)) continue;
      if (next === start) {
        const path: string[] = [];
        for (let step = current; step !== start; step = previous.get(step)!) path.push(step);
        return [start, ...path.reverse(), start];
      }
      if (!previous.has(next)) {
        previous.set(next, current);
        queue.push(next);
      }
    }
  }
  return [];
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
