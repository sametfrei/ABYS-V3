export interface TraversalNode {
  id: string;
}

export interface TraversalEdge {
  id: string;
  from: string;
  to: string;
}

export type TraversalDirection = "outbound" | "inbound" | "both";

export interface TraversalResult<N extends TraversalNode, E extends TraversalEdge> {
  rootNodeIds: string[];
  nodes: N[];
  edges: E[];
  depth: number;
  direction: TraversalDirection;
  truncated: boolean;
}

/**
 * Deterministik BFS ile bir semantik grafik komşuluğunu çıkarır. Düğümler
 * yalnızca gerçek kenarlar üzerinden genişler; maxNodes aşılırsa sonuç
 * sessizce büyümez, `truncated` bayrağı döner.
 */
export function traverseSemanticGraph<N extends TraversalNode, E extends TraversalEdge>(
  graph: { nodes: N[]; edges: E[] },
  options: {
    rootNodeIds: string[];
    depth?: number;
    direction?: TraversalDirection;
    maxNodes?: number;
  }
): TraversalResult<N, E> {
  const depth = Math.max(0, Math.min(8, Math.trunc(options.depth ?? 2)));
  const maxNodes = Math.max(1, Math.min(10_000, Math.trunc(options.maxNodes ?? 500)));
  const direction = options.direction ?? "both";
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const roots = [...new Set(options.rootNodeIds)].filter((id) => nodeById.has(id));
  if (roots.length === 0) {
    return { rootNodeIds: [], nodes: [], edges: [], depth, direction, truncated: false };
  }

  const sortedEdges = [...graph.edges].sort((a, b) => a.id.localeCompare(b.id));
  const outgoing = new Map<string, E[]>();
  const incoming = new Map<string, E[]>();
  for (const edge of sortedEdges) {
    const out = outgoing.get(edge.from) ?? [];
    out.push(edge);
    outgoing.set(edge.from, out);
    const inc = incoming.get(edge.to) ?? [];
    inc.push(edge);
    incoming.set(edge.to, inc);
  }
  const adjacent = (nodeId: string): Array<{ edge: E; next: string }> => {
    if (direction === "outbound") {
      return (outgoing.get(nodeId) ?? []).map((edge) => ({ edge, next: edge.to }));
    }
    if (direction === "inbound") {
      return (incoming.get(nodeId) ?? []).map((edge) => ({ edge, next: edge.from }));
    }
    return [
      ...(outgoing.get(nodeId) ?? []).map((edge) => ({ edge, next: edge.to })),
      ...(incoming.get(nodeId) ?? []).map((edge) => ({ edge, next: edge.from })),
    ].sort((a, b) => a.edge.id.localeCompare(b.edge.id));
  };

  const selectedNodes = new Set<string>();
  const selectedEdges = new Map<string, E>();
  const queue: Array<{ id: string; distance: number }> = roots.map((id) => ({ id, distance: 0 }));
  const queued = new Set(roots);
  let truncated = false;
  while (queue.length > 0) {
    const current = queue.shift()!;
    queued.delete(current.id);
    if (selectedNodes.has(current.id)) continue;
    if (selectedNodes.size >= maxNodes) {
      truncated = true;
      break;
    }
    selectedNodes.add(current.id);
    if (current.distance >= depth) continue;
    for (const link of adjacent(current.id)) {
      if (!nodeById.has(link.next)) continue;
      if (!selectedNodes.has(link.next) && !queued.has(link.next)) {
        if (selectedNodes.size + queued.size >= maxNodes) {
          truncated = true;
          continue;
        }
        queued.add(link.next);
        queue.push({ id: link.next, distance: current.distance + 1 });
      }
      if (selectedNodes.has(link.next) || queued.has(link.next)) {
        selectedEdges.set(link.edge.id, link.edge);
      }
    }
  }

  return {
    rootNodeIds: roots,
    nodes: graph.nodes
      .filter((node) => selectedNodes.has(node.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...selectedEdges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    depth,
    direction,
    truncated,
  };
}
