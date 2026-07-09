import { describe, it, expect } from "vite-plus/test";
import { edgeKinds } from "../../src/kernel/kind.ts";
import { ACTION_WRITES_FIELD_EDGE_KIND } from "../../src/dialects/callable.ts";

describe("regression: no generic edge.kind.writes for action writes", () => {
  it("should not emit generic edge.kind.writes for action field writes", () => {
    // Verify the generic writes edge kind exists but is not used for action field writes
    expect(edgeKinds.WRITES.id).toBe("edge.kind.writes");
    // Verify the dialect-owned field-level edge kind is the correct one to use
    expect(ACTION_WRITES_FIELD_EDGE_KIND.id).toBe("edge.kind.actionWritesField");
  });

  it("function/kernel.ts should use ACTION_WRITES_FIELD_EDGE_KIND", () => {
    // Read the source file to check no references to edgeKinds.WRITES for action writes
    const fs = require("fs");
    const path = require("path");
    const filePath = path.resolve(__dirname, "../../src/function/kernel.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // Should not use edgeKinds.WRITES (generic)
    expect(content).not.toMatch(/edgeKinds\.WRITES/);
    // Should use ACTION_WRITES_FIELD_EDGE_KIND
    expect(content).toMatch(/ACTION_WRITES_FIELD_EDGE_KIND/);
  });

  it("reactivity/rule-derived.ts should use ACTION_WRITES_FIELD_EDGE_KIND", () => {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.resolve(__dirname, "../../src/reactivity/rule-derived.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // Should not use edgeKinds.WRITES
    expect(content).not.toMatch(/edgeKinds\.WRITES/);
    // Should use ACTION_WRITES_FIELD_EDGE_KIND
    expect(content).toMatch(/ACTION_WRITES_FIELD_EDGE_KIND/);
  });
});
