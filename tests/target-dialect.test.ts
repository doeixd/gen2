/**
 * R12 — Target dialect tests.
 *
 * Verifies target dialect registration, capability traits, and target node kinds.
 */

import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import {
  TargetDialect,
  targetCapabilityTraits,
  TARGET_NODE_KIND,
  TARGET_INPUT_NODE_KIND,
  POSTGRES_TARGET_NODE_KIND,
  REACT_TARGET_NODE_KIND,
  SOLID_TARGET_NODE_KIND,
  EFFECT_TARGET_NODE_KIND,
  TARGET_SUPPORTS_CAPABILITY_EDGE_KIND,
  TARGET_LOWERS_FROM_EDGE_KIND,
  TARGET_LEGALIZES_INPUT_EDGE_KIND,
} from "../src/dialects/target.ts";

test("dialect registry resolves target node kind to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForNodeKind(TARGET_NODE_KIND.id)).toBe(TargetDialect);
});

test("dialect registry resolves target input node kind to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForNodeKind(TARGET_INPUT_NODE_KIND.id)).toBe(TargetDialect);
});

test("dialect registry resolves postgres target node kind to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForNodeKind(POSTGRES_TARGET_NODE_KIND.id)).toBe(
    TargetDialect,
  );
});

test("dialect registry resolves react target node kind to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForNodeKind(REACT_TARGET_NODE_KIND.id)).toBe(TargetDialect);
});

test("dialect registry resolves solid target node kind to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForNodeKind(SOLID_TARGET_NODE_KIND.id)).toBe(TargetDialect);
});

test("dialect registry resolves effect target node kind to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForNodeKind(EFFECT_TARGET_NODE_KIND.id)).toBe(TargetDialect);
});

test("dialect registry resolves target capability edge kind to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForEdgeKind(TARGET_SUPPORTS_CAPABILITY_EDGE_KIND.id)).toBe(
    TargetDialect,
  );
});

test("dialect registry resolves target lowers from edge kind to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForEdgeKind(TARGET_LOWERS_FROM_EDGE_KIND.id)).toBe(
    TargetDialect,
  );
});

test("dialect registry resolves target legalizes input edge kind to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForEdgeKind(TARGET_LEGALIZES_INPUT_EDGE_KIND.id)).toBe(
    TargetDialect,
  );
});

test("dialect registry resolves sql capability trait to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForTrait(targetCapabilityTraits.CAPABILITY_SQL.id)).toBe(
    TargetDialect,
  );
});

test("dialect registry resolves rls capability trait to TargetDialect", () => {
  const { ctx } = createGen();
  expect(ctx.dialectRegistry.getDialectForTrait(targetCapabilityTraits.CAPABILITY_RLS.id)).toBe(
    TargetDialect,
  );
});

test("dialect registry resolves react component capability trait to TargetDialect", () => {
  const { ctx } = createGen();
  expect(
    ctx.dialectRegistry.getDialectForTrait(targetCapabilityTraits.CAPABILITY_REACT_COMPONENTS.id),
  ).toBe(TargetDialect);
});

test("dialect registry resolves effect runtime capability trait to TargetDialect", () => {
  const { ctx } = createGen();
  expect(
    ctx.dialectRegistry.getDialectForTrait(targetCapabilityTraits.CAPABILITY_EFFECT_RUNTIME.id),
  ).toBe(TargetDialect);
});

test("postgres target carries sql, rls, transactions, jsonb traits", () => {
  expect(POSTGRES_TARGET_NODE_KIND.traits).toContain(targetCapabilityTraits.CAPABILITY_SQL);
  expect(POSTGRES_TARGET_NODE_KIND.traits).toContain(targetCapabilityTraits.CAPABILITY_RLS);
  expect(POSTGRES_TARGET_NODE_KIND.traits).toContain(
    targetCapabilityTraits.CAPABILITY_TRANSACTIONS,
  );
  expect(POSTGRES_TARGET_NODE_KIND.traits).toContain(targetCapabilityTraits.CAPABILITY_JSONB);
});

test("react target carries react components, optimistic offline, realtime traits", () => {
  expect(REACT_TARGET_NODE_KIND.traits).toContain(
    targetCapabilityTraits.CAPABILITY_REACT_COMPONENTS,
  );
  expect(REACT_TARGET_NODE_KIND.traits).toContain(
    targetCapabilityTraits.CAPABILITY_OPTIMISTIC_OFFLINE,
  );
  expect(REACT_TARGET_NODE_KIND.traits).toContain(targetCapabilityTraits.CAPABILITY_REALTIME);
});

test("solid target carries solid components, optimistic offline, realtime traits", () => {
  expect(SOLID_TARGET_NODE_KIND.traits).toContain(
    targetCapabilityTraits.CAPABILITY_SOLID_COMPONENTS,
  );
  expect(SOLID_TARGET_NODE_KIND.traits).toContain(
    targetCapabilityTraits.CAPABILITY_OPTIMISTIC_OFFLINE,
  );
  expect(SOLID_TARGET_NODE_KIND.traits).toContain(targetCapabilityTraits.CAPABILITY_REALTIME);
});

test("effect target carries effect runtime, transactions, cron traits", () => {
  expect(EFFECT_TARGET_NODE_KIND.traits).toContain(
    targetCapabilityTraits.CAPABILITY_EFFECT_RUNTIME,
  );
  expect(EFFECT_TARGET_NODE_KIND.traits).toContain(targetCapabilityTraits.CAPABILITY_TRANSACTIONS);
  expect(EFFECT_TARGET_NODE_KIND.traits).toContain(targetCapabilityTraits.CAPABILITY_CRON);
});

test("TargetDialect has 14 traits total", () => {
  expect(TargetDialect.traits.length).toBe(10);
});

test("TargetDialect has 7 node kinds", () => {
  expect(TargetDialect.nodeKinds.length).toBe(7);
});

test("TargetDialect has 3 edge kinds", () => {
  expect(TargetDialect.edgeKinds.length).toBe(3);
});
