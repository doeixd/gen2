import { expect, test } from "vite-plus/test";
import { createGen } from "../src/index.ts";
import type { GenConfig } from "../src/gen.ts";
import { createUiNamespace } from "../src/ui/index.ts";

// --- Per-namespace builder --------------------------------------------------

test("createUiNamespace builds a typed UI namespace with config", () => {
  const ui = createUiNamespace({ backend: "jsx" });

  expect(ui._config).toEqual({ backend: "jsx" });
  expect(typeof ui.view).toBe("function");
  expect(typeof ui.attachStyle).toBe("function");
});

test("createUiNamespace works without config", () => {
  const ui = createUiNamespace();

  expect(ui._config).toBeUndefined();
  expect(typeof ui.slot).toBe("function");
});

// --- Generic Gen config -----------------------------------------------------

test("createGen accepts a GenConfig type parameter", () => {
  // Extend GenConfig via a local type alias to simulate a backend plugin
  type MyConfig = GenConfig & {
    ui: { backend: "jsx" };
    db: { dialect: "postgresql" };
  };

  const { gen } = createGen<MyConfig>();

  // gen._config carries the type shape
  const _assertConfig: typeof gen._config = undefined;
  expect(typeof _assertConfig).toBe("undefined");

  // Regular operations still work
  const User = gen.entity("User", { id: gen.types.uuid() });
  expect(User.name).toBe("User");
});

test("createGen works without explicit config (defaults)", () => {
  const { gen } = createGen();
  const User = gen.entity("User", { id: gen.types.uuid() });
  expect(User.name).toBe("User");
});
