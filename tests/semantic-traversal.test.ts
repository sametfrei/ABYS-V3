import { describe, expect, it } from "vitest";
import { traverseSemanticGraph } from "../src/lib/semantic-traversal";

const graph = {
  nodes: [
    { id: "customer" },
    { id: "order" },
    { id: "invoice" },
    { id: "unrelated" },
  ],
  edges: [
    { id: "o-c", from: "order", to: "customer" },
    { id: "i-o", from: "invoice", to: "order" },
  ],
};

describe("semantik grafik çok-hop gezinme", () => {
  it("iki yönlü BFS ile iki hop komşuluğu döner", () => {
    const result = traverseSemanticGraph(graph, { rootNodeIds: ["customer"], depth: 2 });
    expect(result.nodes.map((node) => node.id)).toEqual(["customer", "invoice", "order"]);
    expect(result.edges.map((edge) => edge.id)).toEqual(["i-o", "o-c"]);
    expect(result.truncated).toBe(false);
  });

  it("yön ve derinliği uygular", () => {
    expect(
      traverseSemanticGraph(graph, { rootNodeIds: ["customer"], depth: 1, direction: "outbound" })
        .nodes
    ).toEqual([{ id: "customer" }]);
    expect(
      traverseSemanticGraph(graph, { rootNodeIds: ["customer"], depth: 1, direction: "inbound" })
        .nodes.map((node) => node.id)
    ).toEqual(["customer", "order"]);
  });

  it("maxNodes sınırında sessizce büyümez", () => {
    const result = traverseSemanticGraph(graph, {
      rootNodeIds: ["customer"],
      depth: 2,
      maxNodes: 2,
    });
    expect(result.nodes).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("bilinmeyen kökte boş sonuç döner", () => {
    expect(
      traverseSemanticGraph(graph, { rootNodeIds: ["missing"], depth: 2 }).nodes
    ).toEqual([]);
  });
});
