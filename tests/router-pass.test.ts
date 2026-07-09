import { expect, test } from "vite-plus/test";
import { createGen, kernel, router } from "../src/index.ts";
import { appRouteToGraphFragment, getAppRoutesFromGraph } from "../src/router/kernel.ts";
import { check } from "../src/lifecycle/lifecycle.ts";

test("app route graph reader recovers typed route payloads", () => {
  const { gen } = createGen();
  const route = router.defineAppRoute({
    path: "/users/:id",
    path_params: { id: gen.types.uuid() },
  });

  const graph = kernel.graph.pipe(appRouteToGraphFragment(route));

  expect(getAppRoutesFromGraph(graph)).toEqual([route]);
});

test("derive.appRoutes runs graph-native missing path parameter diagnostics", () => {
  const { ctx, gen } = createGen();

  gen.router.route({ path: "/users/:id" });
  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "router:path-param-missing-schema")).toBe(true);
});

test("derive.appRoutes runs graph-native unused path parameter diagnostics", () => {
  const { ctx, gen } = createGen();

  gen.router.route({
    path: "/users",
    path_params: { id: gen.types.uuid() },
  });
  const result = check(ctx);

  expect(result.diagnostics.some((d) => d.code === "router:path-param-unused-schema")).toBe(true);
});
