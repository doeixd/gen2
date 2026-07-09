/**
 * Quick Win #1 (PLAN.md §7): replace `Date.now()` IDs in `kernel/transform.ts`
 * and `kernel/diagnostic.ts` with deterministic IDs.
 *
 * Date-based IDs prevent graph diff, snapshot replay, and dedup of
 * re-emitted findings. These tests lock in the deterministic behavior.
 */

import { describe, expect, it } from "vite-plus/test";

import { defineTransform } from "../src/kernel/transform.ts";
import { defineDiagnostic, errorDiagnostic, warningDiagnostic } from "../src/kernel/diagnostic.ts";
import { traits, traitAppliesTo } from "../src/kernel/trait.ts";
import type { KernelType } from "../src/kernel/type.ts";
import type { KernelId } from "../src/kernel/id.ts";
import { id } from "../src/kernel/id.ts";
import { ACTION_WRITES_FIELD_EDGE_KIND, ACTION_NODE_KIND } from "../src/dialects/callable.ts";

const fakeType = (id: string): KernelType<unknown> => ({
  kind: { id: "type.custom", label: "Custom" },
  id: id as KernelId<"type">,
  traits: [],
});

describe("kernel/transform.ts — deterministic IDs", () => {
  it("derives the same ID twice for the same from/to/direction", () => {
    const a = defineTransform(fakeType("type:a"), fakeType("type:b"), {
      direction: "decode",
    });
    const b = defineTransform(fakeType("type:a"), fakeType("type:b"), {
      direction: "decode",
    });
    expect(a.id).toBe(b.id);
  });

  it("produces different IDs for different directions", () => {
    const enc = defineTransform(fakeType("type:a"), fakeType("type:b"), {
      direction: "encode",
    });
    const dec = defineTransform(fakeType("type:a"), fakeType("type:b"), {
      direction: "decode",
    });
    expect(enc.id).not.toBe(dec.id);
  });

  it("produces different IDs for different type pairs", () => {
    const ab = defineTransform(fakeType("type:a"), fakeType("type:b"));
    const ac = defineTransform(fakeType("type:a"), fakeType("type:c"));
    expect(ab.id).not.toBe(ac.id);
  });

  it("respects an explicit `id` override", () => {
    const t = defineTransform(fakeType("type:a"), fakeType("type:b"), {
      id: "transform:my-codec",
    });
    expect(t.id).toBe("transform:my-codec");
  });

  it("default ID does not contain a timestamp", () => {
    const t = defineTransform(fakeType("type:a"), fakeType("type:b"));
    // Date.now() values are 13-digit numbers in 2026; the deterministic
    // form should not contain anything looking like one.
    expect(t.id).not.toMatch(/\d{13}/);
  });
});

describe("kernel/diagnostic.ts — deterministic IDs", () => {
  it("derives the same ID twice for the same code/subject/message", () => {
    const a = defineDiagnostic("test:code", "error", "boom");
    const b = defineDiagnostic("test:code", "error", "boom");
    expect(a.id).toBe(b.id);
  });

  it("produces different IDs for different messages on the same code", () => {
    const a = defineDiagnostic("test:code", "error", "first failure");
    const b = defineDiagnostic("test:code", "error", "second failure");
    expect(a.id).not.toBe(b.id);
  });

  it("incorporates subject in the ID", () => {
    const a = defineDiagnostic("test:code", "error", "boom", {
      subject: "node:1" as KernelId,
    });
    const b = defineDiagnostic("test:code", "error", "boom", {
      subject: "node:2" as KernelId,
    });
    expect(a.id).not.toBe(b.id);
  });

  it("respects an explicit `id` override", () => {
    const d = defineDiagnostic("test:code", "error", "boom", {
      id: "diag:my-finding-1",
    });
    expect(d.id).toBe("diag:my-finding-1");
  });

  it("default ID does not contain a timestamp", () => {
    const d = defineDiagnostic("test:code", "error", "boom");
    expect(d.id).not.toMatch(/\d{13}/);
  });

  it("severity helpers (errorDiagnostic / warningDiagnostic) preserve determinism", () => {
    const a = errorDiagnostic("c", "m");
    const b = errorDiagnostic("c", "m");
    expect(a.id).toBe(b.id);
    expect(a.severity).toBe("error");

    const w = warningDiagnostic("c", "m");
    expect(w.severity).toBe("warning");
  });
});

describe("kernel/id.ts — namespace-bound branded ID factories", () => {
  it("builds deterministic node, edge, pass, and artifact IDs", () => {
    const callableId = id.createFactory("callable");
    const actionId = callableId.node(ACTION_NODE_KIND, "updateProjectStatus");
    const fieldRef = { id: "field:Project.status", name: "status" };
    const edgeId = callableId.edge(ACTION_WRITES_FIELD_EDGE_KIND, actionId, fieldRef);

    expect(actionId).toBe("node:callable:node.kind.action:updateProjectStatus");
    expect(edgeId).toBe(
      "edge:callable:edge.kind.actionWritesField:node:callable:node.kind.action:updateProjectStatus:field:Project.status",
    );
    expect(callableId.pass("derive.action.writes")).toBe("pass:callable:derive.action.writes");
    expect(callableId.artifact("action-writes.json")).toBe("artifact:callable:action-writes.json");
  });

  it("parses dynamic IDs through the namespace factory boundary", () => {
    const callableId = id.createFactory("callable");
    const parsed = callableId.parse.node(
      ACTION_NODE_KIND,
      "node:callable:node.kind.action:updateProjectStatus",
    );

    expect(parsed).toBe("node:callable:node.kind.action:updateProjectStatus");
  });
});

describe("kernel/trait.ts — ENTRYPOINT trait (Quick Win #6)", () => {
  it("is registered on the standard trait registry", () => {
    expect(traits.NODE.ENTRYPOINT).toBeDefined();
    expect(traits.NODE.ENTRYPOINT.id).toBe("trait.node.entrypoint");
  });

  it("targets node objects (graph-shaking root marker)", () => {
    expect(traits.NODE.ENTRYPOINT.target).toBe("node");
    expect(traitAppliesTo(traits.NODE.ENTRYPOINT, "node")).toBe(true);
    expect(traitAppliesTo(traits.NODE.ENTRYPOINT, "edge")).toBe(false);
  });

  it("has a stable label", () => {
    expect(traits.NODE.ENTRYPOINT.label).toBe("Entrypoint (graph-shaking root)");
  });
});

describe("kernel/trait.ts — laws unified into traits (Quick Win #5)", () => {
  it("the standard law set is reachable through traits.LAW", () => {
    expect(traits.LAW.IDEMPOTENT).toBeDefined();
    expect(traits.LAW.ASSOCIATIVE).toBeDefined();
    expect(traits.LAW.COMMUTATIVE).toBeDefined();
    expect(traits.LAW.MONOTONIC).toBeDefined();
    expect(traits.LAW.REVERSIBLE).toBeDefined();
    expect(traits.LAW.IDENTITY).toBeDefined();
    expect(traits.LAW.INVERSE).toBeDefined();
    expect(traits.LAW.DETERMINISTIC).toBeDefined();
    expect(traits.LAW.PARALLEL_SAFE).toBeDefined();
    expect(traits.LAW.ROLLBACK_SAFE).toBeDefined();
  });

  it("law trait IDs are stable", () => {
    expect(traits.LAW.IDEMPOTENT.id).toBe("trait.law.idempotent");
    expect(traits.LAW.ASSOCIATIVE.id).toBe("trait.law.associative");
    expect(traits.LAW.IDENTITY.id).toBe("trait.law.identity");
    expect(traits.LAW.INVERSE.id).toBe("trait.law.inverse");
  });

  it("law traits target node or transform (not their own primitive family)", () => {
    expect(traits.LAW.IDEMPOTENT.target).toBe("node");
    expect(traits.LAW.REVERSIBLE.target).toBe("transform");
  });
});
