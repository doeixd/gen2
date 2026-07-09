import { describe, expectTypeOf, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";
import {
  DOMAIN_RELATION_EDGE_KIND,
  ENTITY_NODE_KIND,
  FIELD_NODE_KIND,
} from "../src/dialects/domain/entity-field-relation.ts";
import {
  ACTION_NODE_KIND,
  ACTION_WRITES_FIELD_EDGE_KIND,
  CallableDialect,
  QUERY_NODE_KIND,
} from "../src/dialects/callable.ts";
import { PROVIDER_NODE_KIND, SATISFIES_EDGE_KIND } from "../src/dialects/core/provider.ts";
import { REQUIREMENT_NODE_KIND } from "../src/dialects/core/requirement.ts";
import type { KernelId } from "../src/kernel/id.ts";

describe("kernel typed witnesses", () => {
  test("namespace-bound ID factories preserve namespace, ID family, and kind witness", () => {
    const callableId = kernel.id.createFactory("callable");
    const actionId = callableId.node(ACTION_NODE_KIND, "updateProjectStatus");
    const queryId = callableId.node(QUERY_NODE_KIND, "listProjects");
    const writesId = callableId.edge(ACTION_WRITES_FIELD_EDGE_KIND, actionId, "Project.status");
    const acceptsActionId = (
      value: kernel.NamespacedKernelId<"node", "callable", typeof ACTION_NODE_KIND, string>,
    ) => value;
    const acceptsWritesId = (
      value: kernel.NamespacedKernelId<
        "edge",
        "callable",
        typeof ACTION_WRITES_FIELD_EDGE_KIND,
        string
      >,
    ) => value;

    expectTypeOf(actionId).toMatchTypeOf<kernel.KernelId<"node">>();
    expectTypeOf(writesId).toMatchTypeOf<kernel.KernelId<"edge">>();
    acceptsActionId(actionId);
    acceptsWritesId(writesId);

    // @ts-expect-error action and query node-kind witnesses remain distinct
    acceptsActionId(queryId);
    // @ts-expect-error edge IDs are not node IDs
    acceptsActionId(writesId);
  });

  test("node refs require branded node ids on the primary authoring path", () => {
    const callableId = kernel.id.createFactory("callable");
    const actionId = callableId.node(ACTION_NODE_KIND, "updateProjectStatus");
    const queryId = callableId.node(QUERY_NODE_KIND, "listProjects");
    const actionRef = kernel.nodeRef(ACTION_NODE_KIND, actionId, {
      name: "updateProjectStatus",
    });
    const parsedRef = kernel.nodeRef.parse(ACTION_NODE_KIND, "node:callable:action:dynamic");
    const unsafeRef = kernel.nodeRef.unsafe(ACTION_NODE_KIND, "node:callable:action:dynamic");
    const acceptsActionRef = (
      value: kernel.KernelNodeRef<
        kernel.NodeKindFromDef<typeof ACTION_NODE_KIND>,
        kernel.NamespacedKernelId<"node", "callable", typeof ACTION_NODE_KIND, string>
      >,
    ) => value;

    expectTypeOf(actionRef.id).toEqualTypeOf<typeof actionId>();
    expectTypeOf(actionRef.name).toEqualTypeOf<"updateProjectStatus" | undefined>();
    expectTypeOf(parsedRef.nodeKind.id).toEqualTypeOf<typeof ACTION_NODE_KIND.id>();
    expectTypeOf(unsafeRef.nodeKind.id).toEqualTypeOf<typeof ACTION_NODE_KIND.id>();
    acceptsActionRef(actionRef);

    // @ts-expect-error raw strings belong behind nodeRef.parse/unsafe
    kernel.nodeRef(ACTION_NODE_KIND, "node:callable:action:raw");
    // @ts-expect-error node-kind witness must match the branded id's node-kind witness
    kernel.nodeRef(ACTION_NODE_KIND, queryId);
  });

  test("ref namespace builds node and edge refs from namespace-bound id factories", () => {
    const callableId = kernel.id.createFactory("callable");
    const action = kernel.ref.node(callableId, ACTION_NODE_KIND, "updateProjectStatus");
    const query = kernel.ref.node(callableId, QUERY_NODE_KIND, "listProjects");
    const edge = kernel.ref.edge(
      callableId,
      ACTION_WRITES_FIELD_EDGE_KIND,
      action,
      "Project.status",
    );
    const parsedAction = kernel.ref.parse.node(
      callableId,
      ACTION_NODE_KIND,
      "node:callable:node.kind.action:external",
    );
    const unsafeEdge = kernel.ref.unsafe.edge(
      ACTION_WRITES_FIELD_EDGE_KIND,
      "edge:callable:actionWritesField:external",
    );

    expectTypeOf(action.nodeKind.id).toEqualTypeOf<typeof ACTION_NODE_KIND.id>();
    expectTypeOf(action.id).toMatchTypeOf<
      kernel.NamespacedKernelId<"node", "callable", typeof ACTION_NODE_KIND, string>
    >();
    expectTypeOf(edge.edgeKind.id).toEqualTypeOf<typeof ACTION_WRITES_FIELD_EDGE_KIND.id>();
    expectTypeOf(parsedAction.nodeKind.id).toEqualTypeOf<typeof ACTION_NODE_KIND.id>();
    expectTypeOf(unsafeEdge.edgeKind.id).toEqualTypeOf<typeof ACTION_WRITES_FIELD_EDGE_KIND.id>();

    // @ts-expect-error node-kind witness must match the branded id's node-kind witness
    kernel.nodeRef(ACTION_NODE_KIND, query.id);
  });

  test("edge-kind witnesses derive endpoint input object keys", () => {
    type Inputs = kernel.EndpointInputsFor<typeof DOMAIN_RELATION_EDGE_KIND>;

    expectTypeOf<keyof Inputs>().toEqualTypeOf<"from" | "to" | "fromField" | "toField">();
  });

  test("witness-first graph patches preserve edge kind and metadata payload types", () => {
    const callableId = kernel.id.createFactory("callable");
    const actionRef = kernel.nodeRef.unsafe(ACTION_NODE_KIND, "node:action");
    const fieldRef = kernel.nodeRef.unsafe(FIELD_NODE_KIND, "node:field:Project.status");
    const writesId = callableId.edge(ACTION_WRITES_FIELD_EDGE_KIND, actionRef, fieldRef);
    const patch = kernel.graphPatch.addEdge(
      ACTION_WRITES_FIELD_EDGE_KIND,
      writesId,
      {
        action: actionRef,
        field: fieldRef,
      },
      {
        metadata: {
          custom: {
            operation: "update",
            field_name: "status",
            entity_name: "Project",
            has_condition: false,
          },
        },
      },
    );

    expectTypeOf(patch.edge.kind.id).toEqualTypeOf<typeof ACTION_WRITES_FIELD_EDGE_KIND.id>();
    expectTypeOf(patch.edge.id).toEqualTypeOf<typeof writesId>();
    expectTypeOf(patch.edge.metadata?.custom?.operation).toMatchTypeOf<
      "insert" | "update" | "delete" | undefined
    >();

    kernel.graphPatch.addEdge(
      ACTION_WRITES_FIELD_EDGE_KIND,
      // @ts-expect-error primary graph patch edge path requires a branded edge id
      "edge:bad",
      {
        action: actionRef,
        field: fieldRef,
      },
    );

    kernel.graphPatch.addEdge(ACTION_WRITES_FIELD_EDGE_KIND, writesId, {
      action: actionRef,
      field: fieldRef,
      // @ts-expect-error endpoint objects cannot include non-dialect roles
      key: fieldRef,
    });

    kernel.graphPatch.addEdge(
      ACTION_WRITES_FIELD_EDGE_KIND,
      writesId,
      {
        action: actionRef,
        field: fieldRef,
      },
      {
        metadata: {
          custom: {
            // @ts-expect-error custom metadata is typed by ACTION_WRITES_FIELD_EDGE_KIND
            operation: "upsert",
            field_name: "status",
            entity_name: "Project",
            has_condition: false,
          },
        },
      },
    );
  });

  test("edge construction requires the dialect endpoint shape", () => {
    const entityRef = kernel.nodeRef.unsafe(ENTITY_NODE_KIND, "node:entity:User");
    const fieldRef = kernel.nodeRef.unsafe(FIELD_NODE_KIND, "node:field:User.id");

    kernel.defineEdgeFromKind(DOMAIN_RELATION_EDGE_KIND, "edge:relation", {
      from: entityRef,
      to: entityRef,
      fromField: fieldRef,
      toField: fieldRef,
    });

    kernel.defineEdgeFromKind(DOMAIN_RELATION_EDGE_KIND, "edge:relation", {
      from: { target: entityRef, cardinality: "one" },
      to: { target: entityRef, cardinality: "many" },
      fromField: { target: fieldRef, cardinality: "one" },
      toField: { target: fieldRef, cardinality: "one" },
    });

    // @ts-expect-error missing required `toField` endpoint
    kernel.defineEdgeFromKind(DOMAIN_RELATION_EDGE_KIND, "edge:relation", {
      from: entityRef,
      to: entityRef,
      fromField: fieldRef,
    });

    kernel.defineEdgeFromKind(DOMAIN_RELATION_EDGE_KIND, "edge:relation", {
      from: entityRef,
      to: entityRef,
      fromField: fieldRef,
      toField: fieldRef,
      // @ts-expect-error endpoint objects cannot include non-dialect roles
      source: entityRef,
    });
  });

  test("curried edge builder preserves endpoint, metadata, and branded id inference", () => {
    const callableId = kernel.id.createFactory("callable");
    const coreId = kernel.id.createFactory("core");
    const actionRef = kernel.ref.node(callableId, ACTION_NODE_KIND, "updateProjectStatus");
    const fieldRef = kernel.ref.node(callableId, FIELD_NODE_KIND, "Project.status");
    const writesId = callableId.edge(ACTION_WRITES_FIELD_EDGE_KIND, actionRef, fieldRef);
    const satisfiesId = coreId.edge(SATISFIES_EDGE_KIND, "provider", "requirement");

    const edge = kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      .from({ action: actionRef, field: fieldRef })
      .id(writesId)
      .metadata({
        custom: {
          operation: "update",
          field_name: "status",
          entity_name: "Project",
          has_condition: false,
        },
      })
      .done();

    const autoIdEdge = kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      .from({ action: actionRef, field: fieldRef })
      .autoId(callableId, actionRef, fieldRef)
      .done();

    const parsedEdge = kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      .from({ action: actionRef, field: fieldRef })
      .parseId(callableId, "edge:callable:edge.kind.actionWritesField:external")
      .done();

    const unsafeEdge = kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      .from({ action: actionRef, field: fieldRef })
      .unsafeId("edge:callable:edge.kind.actionWritesField:unsafe")
      .done();

    expectTypeOf(edge.id).toEqualTypeOf<typeof writesId>();
    expectTypeOf(edge.kind.id).toEqualTypeOf<typeof ACTION_WRITES_FIELD_EDGE_KIND.id>();
    expectTypeOf(edge.metadata?.custom?.operation).toMatchTypeOf<
      "insert" | "update" | "delete" | undefined
    >();
    expectTypeOf(autoIdEdge.id).toMatchTypeOf<
      kernel.NamespacedKernelId<"edge", "callable", typeof ACTION_WRITES_FIELD_EDGE_KIND, string>
    >();
    expectTypeOf(parsedEdge.id).toMatchTypeOf<
      kernel.NamespacedKernelId<"edge", "callable", typeof ACTION_WRITES_FIELD_EDGE_KIND, string>
    >();
    expectTypeOf(unsafeEdge.id).toMatchTypeOf<kernel.KernelId<"edge">>();

    kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      .from({ action: actionRef, field: fieldRef })
      // @ts-expect-error primary id path requires a branded edge id
      .id("edge:raw");

    kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      .from({ action: actionRef, field: fieldRef })
      // @ts-expect-error edge id witness must match the edge-kind witness
      .id(satisfiesId);

    kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      .from({ action: actionRef, field: fieldRef })
      .id(writesId)
      .metadata({
        custom: {
          // @ts-expect-error metadata custom is inferred from the edge-kind witness
          operation: "upsert",
          field_name: "status",
          entity_name: "Project",
          has_condition: false,
        },
      });
  });

  test("kernel.edge(kind).from((e) => ...) callback form preserves endpoint inference", () => {
    const callableId = kernel.id.createFactory("callable");
    const actionRef = kernel.ref.node(callableId, ACTION_NODE_KIND, "updateProjectStatus");
    const fieldRef = kernel.ref.node(callableId, FIELD_NODE_KIND, "Project.status");

    // Callback form — the `e` helper exposes pass-through `node(ref)`
    // and `with(ref, cardinality)` helpers so authoring complex edges
    // stays readable without sacrificing endpoint inference.
    const built = kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      .from((e) => ({ action: e.node(actionRef), field: e.node(fieldRef) }))
      .autoId(callableId, actionRef, fieldRef)
      .done();

    expectTypeOf(built.kind.id).toEqualTypeOf<typeof ACTION_WRITES_FIELD_EDGE_KIND.id>();
    expectTypeOf(built.id).toMatchTypeOf<
      kernel.NamespacedKernelId<"edge", "callable", typeof ACTION_WRITES_FIELD_EDGE_KIND, string>
    >();

    // Callback form rejects refs whose node-kind witness does not match
    // the endpoint role target-kind constraint.
    const orgRef = kernel.ref.node(callableId, QUERY_NODE_KIND, "listProjects");
    kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      // @ts-expect-error action endpoint requires an ACTION_NODE_KIND ref
      .from((e) => ({ action: e.node(orgRef), field: e.node(fieldRef) }));

    // `e.with(ref, cardinality)` attaches typed cardinality to an endpoint.
    const withCardinality = kernel
      .edge(ACTION_WRITES_FIELD_EDGE_KIND)
      .from((e) => ({
        action: e.with(actionRef, "one"),
        field: e.node(fieldRef),
      }))
      .autoId(callableId, actionRef, fieldRef)
      .done();
    expectTypeOf(withCardinality.kind.id).toEqualTypeOf<typeof ACTION_WRITES_FIELD_EDGE_KIND.id>();
  });

  test("node-kind witnesses preserve literal ids in constructed nodes", () => {
    const node = kernel.defineNodeFromKind(ENTITY_NODE_KIND, "node:user", { name: "User" });

    expectTypeOf(node.kind.id).toEqualTypeOf<KernelId<"node.kind"> & "node.kind.entity">();
  });

  test("witness-first graph patches preserve branded node ids", () => {
    const domainId = kernel.id.createFactory("domain");
    const entityId = domainId.node(ENTITY_NODE_KIND, "User");
    const fieldId = domainId.node(FIELD_NODE_KIND, "User.id");
    const patch = kernel.graphPatch.addNode(ENTITY_NODE_KIND, entityId, { name: "User" });

    expectTypeOf(patch.node.id).toEqualTypeOf<typeof entityId>();
    expectTypeOf(patch.node.kind.id).toEqualTypeOf<typeof ENTITY_NODE_KIND.id>();

    kernel.graphPatch.addNode(
      ENTITY_NODE_KIND,
      // @ts-expect-error primary graph patch node path requires a branded node id
      "node:raw",
      { name: "User" },
    );
    kernel.graphPatch.addNode(
      ENTITY_NODE_KIND,
      // @ts-expect-error node id witness must match the node-kind witness
      fieldId,
      { name: "User" },
    );
  });

  test("node-kind witnesses type metadata custom and refs preserve node kind", () => {
    const node = kernel.defineNodeFromKind(PROVIDER_NODE_KIND, "node:provider:session", {
      name: "session",
      metadata: {
        custom: {
          provides: "Session",
          source_kind: "cookie",
          lifetime: "session",
        },
      },
    });
    const ref = kernel.refOf(node);

    expectTypeOf(node.metadata?.custom?.source_kind).toMatchTypeOf<"cookie" | undefined>();
    expectTypeOf(ref.nodeKind.id).toEqualTypeOf<typeof node.kind.id>();

    kernel.defineNodeFromKind(PROVIDER_NODE_KIND, "node:provider:bad", {
      metadata: {
        custom: {
          provides: "Session",
          // @ts-expect-error provider metadata custom is typed by PROVIDER_NODE_KIND
          source_kind: "not-a-provider-source",
        },
      },
    });
  });

  test("edge-kind witnesses expose named endpoint readers", () => {
    const providerRef = kernel.nodeRef.unsafe(PROVIDER_NODE_KIND, "node:provider");
    const requirementRef = kernel.nodeRef.unsafe(REQUIREMENT_NODE_KIND, "node:requirement");
    const edge = kernel.defineEdgeFromKind(SATISFIES_EDGE_KIND, "edge:satisfies", {
      provider: providerRef,
      requirement: requirementRef,
    });
    const endpoints = kernel.readEdgeEndpoints(SATISFIES_EDGE_KIND, edge);
    const dynamicEndpoints = kernel.tryReadEdgeEndpoints(SATISFIES_EDGE_KIND, edge);

    expectTypeOf(edge.endpoints[0].role.label).toEqualTypeOf<"provider">();
    expectTypeOf(edge.endpoints[1].role.label).toEqualTypeOf<"requirement">();
    expectTypeOf(endpoints.provider.role.label).toEqualTypeOf<"provider">();
    expectTypeOf(endpoints.requirement.role.label).toEqualTypeOf<"requirement">();
    expectTypeOf(dynamicEndpoints?.provider.role.label).toEqualTypeOf<"provider" | undefined>();
  });

  test("static endpoint reader requires a matching edge-kind witness", () => {
    const entityRef = kernel.nodeRef.unsafe(ENTITY_NODE_KIND, "node:entity:User");
    const fieldRef = kernel.nodeRef.unsafe(FIELD_NODE_KIND, "node:field:User.id");
    const relationEdge = kernel.defineEdgeFromKind(DOMAIN_RELATION_EDGE_KIND, "edge:relation", {
      from: entityRef,
      to: entityRef,
      fromField: fieldRef,
      toField: fieldRef,
    });

    // @ts-expect-error static endpoint reads require the edge to match the kind witness
    kernel.readEdgeEndpoints(SATISFIES_EDGE_KIND, relationEdge);

    kernel.tryReadEdgeEndpoints(SATISFIES_EDGE_KIND, relationEdge);
  });

  test("graph builder accumulates node and edge witnesses through type state", () => {
    const providerRef = kernel.nodeRef.unsafe(PROVIDER_NODE_KIND, "node:provider");
    const requirementRef = kernel.nodeRef.unsafe(REQUIREMENT_NODE_KIND, "node:requirement");
    const provider = kernel.defineNodeFromKind(PROVIDER_NODE_KIND, "node:provider", {
      name: "provider",
      metadata: {
        custom: {
          provides: "Session",
          source_kind: "service_constructor",
        },
      },
    });
    const satisfies = kernel.defineEdgeFromKind(SATISFIES_EDGE_KIND, "edge:satisfies", {
      provider: providerRef,
      requirement: requirementRef,
    });

    const builder = kernel.createGraphBuilder().node(provider).edge(satisfies);
    type State = kernel.GraphBuilderStateOf<typeof builder>;

    expectTypeOf<State["nodes"]>().toEqualTypeOf<readonly [typeof provider]>();
    expectTypeOf<State["edges"]>().toEqualTypeOf<readonly [typeof satisfies]>();
  });

  test("graph writer returns authored witnesses from scoped writes", () => {
    const provider = kernel.defineNodeFromKind(PROVIDER_NODE_KIND, "node:provider", {
      metadata: {
        custom: {
          provides: "Session",
          source_kind: "service_constructor",
        },
      },
    });
    const providerRef = kernel.nodeRef.unsafe(PROVIDER_NODE_KIND, "node:provider");
    const requirementRef = kernel.nodeRef.unsafe(REQUIREMENT_NODE_KIND, "node:requirement");
    const satisfies = kernel.defineEdgeFromKind(SATISFIES_EDGE_KIND, "edge:satisfies", {
      provider: providerRef,
      requirement: requirementRef,
    });

    kernel.buildGraph((w) => {
      const writtenNode = w.node(provider);
      const writtenEdge = w.edge(satisfies);

      expectTypeOf(writtenNode).toEqualTypeOf<typeof provider>();
      expectTypeOf(writtenEdge).toEqualTypeOf<typeof satisfies>();
    });
  });

  test("graph steps preserve authored witnesses through fragment output type state", () => {
    const providerRef = kernel.nodeRef.unsafe(PROVIDER_NODE_KIND, "node:provider");
    const requirementRef = kernel.nodeRef.unsafe(REQUIREMENT_NODE_KIND, "node:requirement");
    const provider = kernel.defineNodeFromKind(PROVIDER_NODE_KIND, "node:provider", {
      metadata: {
        custom: {
          provides: "Session",
          source_kind: "service_constructor",
        },
      },
    });
    const satisfies = kernel.defineEdgeFromKind(SATISFIES_EDGE_KIND, "edge:satisfies", {
      provider: providerRef,
      requirement: requirementRef,
    });

    const nodeStep = kernel.graphNode(provider);
    const edgeStep = kernel.graphEdge(satisfies);
    const fragment = kernel.graphFragment(nodeStep, edgeStep);
    const pipedGraph = kernel.graph.pipe(fragment);
    type NodeState = kernel.GraphStepOutputOf<typeof nodeStep>;
    type EdgeState = kernel.GraphStepOutputOf<typeof edgeStep>;
    type FragmentState = kernel.GraphStepOutputOf<typeof fragment>;
    type PipedState = kernel.GraphStateOf<typeof pipedGraph>;

    expectTypeOf<NodeState["nodes"]>().toEqualTypeOf<readonly [typeof provider]>();
    expectTypeOf<EdgeState["edges"]>().toEqualTypeOf<readonly [typeof satisfies]>();
    expectTypeOf<FragmentState["nodes"]>().toEqualTypeOf<readonly [typeof provider]>();
    expectTypeOf<FragmentState["edges"]>().toEqualTypeOf<readonly [typeof satisfies]>();
    expectTypeOf<PipedState["nodes"]>().toEqualTypeOf<readonly [typeof provider]>();
    expectTypeOf<PipedState["edges"]>().toEqualTypeOf<readonly [typeof satisfies]>();
  });

  test("graph inspector facade infers from edge-kind witnesses", () => {
    const providerRef = kernel.nodeRef.unsafe(PROVIDER_NODE_KIND, "node:provider");
    const requirementRef = kernel.nodeRef.unsafe(REQUIREMENT_NODE_KIND, "node:requirement");
    const provider = kernel.defineNodeFromKind(PROVIDER_NODE_KIND, "node:provider", {
      metadata: {
        custom: {
          provides: "Session",
          source_kind: "service_constructor",
        },
      },
    });
    const satisfies = kernel.defineEdgeFromKind(SATISFIES_EDGE_KIND, "edge:satisfies", {
      provider: providerRef,
      requirement: requirementRef,
    });
    const graph = kernel.createGraphBuilder().node(provider).edge(satisfies).done();
    const inspector = kernel.inspectGraph(graph);
    const requirements = inspector.edges
      .ofKind(SATISFIES_EDGE_KIND)
      .whereEndpoint("provider", providerRef)
      .targets("requirement");

    expectTypeOf(
      inspector.nodes.ofKind(PROVIDER_NODE_KIND).toArray()[0]?.metadata?.custom?.source_kind,
    ).toMatchTypeOf<string | undefined>();
    expectTypeOf(requirements).toMatchTypeOf<readonly unknown[]>();

    // @ts-expect-error endpoint names are inferred from the edge-kind witness
    inspector.edges.ofKind(SATISFIES_EDGE_KIND).whereEndpoint("missing", providerRef);
  });

  test("operation witnesses preserve literal ids, argument tuples, and output types", () => {
    expectTypeOf<typeof kernel.OPERATIONS.EQ.id>().toEqualTypeOf<KernelId<"op"> & "op.eq">();
    expectTypeOf<kernel.ArgsOf<typeof kernel.OPERATIONS.CASE>>().toEqualTypeOf<
      typeof kernel.OPERATIONS.CASE.args
    >();
    expectTypeOf<kernel.OutputOf<typeof kernel.OPERATIONS.CONCAT>>().toEqualTypeOf<
      typeof kernel.OPERATIONS.CONCAT.output
    >();
  });

  test("operation registries preserve exact operation lookups", () => {
    const registry = kernel.defineOpRegistry(kernel.OPERATIONS);
    const op = registry.get(kernel.OPERATIONS.NOT.id);

    expectTypeOf(op).toEqualTypeOf<typeof kernel.OPERATIONS.NOT | undefined>();
  });

  test("dialect ids preserve literal values", () => {
    const id = kernel.dialectId("dialect.example");

    expectTypeOf(id.value).toEqualTypeOf<"dialect.example">();
  });

  test("namespace factory exposes typed nodeRef and edgeRef constructors", () => {
    const callableId = kernel.id.createFactory("callable");
    const otherId = kernel.id.createFactory("other");
    const actionRef = callableId.nodeRef(ACTION_NODE_KIND, "updateProjectStatus");
    const writesRef = callableId.edgeRef(ACTION_WRITES_FIELD_EDGE_KIND, "actionId", "fieldId");

    expectTypeOf(actionRef.nodeKind.id).toEqualTypeOf<typeof ACTION_NODE_KIND.id>();
    expectTypeOf(actionRef.id).toMatchTypeOf<
      kernel.NamespacedKernelId<"node", "callable", typeof ACTION_NODE_KIND, string>
    >();
    expectTypeOf(writesRef.edgeKind.id).toEqualTypeOf<typeof ACTION_WRITES_FIELD_EDGE_KIND.id>();
    expectTypeOf(writesRef.id).toMatchTypeOf<
      kernel.NamespacedKernelId<"edge", "callable", typeof ACTION_WRITES_FIELD_EDGE_KIND, string>
    >();

    const acceptsCallableNodeRef = (
      value: kernel.KernelNodeRef<
        kernel.NodeKindFromDef<typeof ACTION_NODE_KIND>,
        kernel.NamespacedKernelId<"node", "callable", typeof ACTION_NODE_KIND, string>
      >,
    ) => value;
    acceptsCallableNodeRef(actionRef);

    const otherRef = otherId.nodeRef(ACTION_NODE_KIND, "x");
    // @ts-expect-error cross-namespace refs do not satisfy a callable-bound parameter
    acceptsCallableNodeRef(otherRef);
  });

  test("dialect-owned factory inherits namespace literal and brands cross-dialect refs", () => {
    // CallableDialect carries `namespace: "callable"`.
    const actionRef = CallableDialect.id.nodeRef(ACTION_NODE_KIND, "updateProjectStatus");

    expectTypeOf(CallableDialect.namespace).toEqualTypeOf<"callable">();
    expectTypeOf(actionRef.id).toMatchTypeOf<
      kernel.NamespacedKernelId<"node", "callable", typeof ACTION_NODE_KIND, string>
    >();

    const acceptsOtherNamespace = (
      value: kernel.NamespacedKernelId<"node", "postgres", typeof ACTION_NODE_KIND, string>,
    ) => value;
    // @ts-expect-error CallableDialect.id is branded with "callable", not "postgres"
    acceptsOtherNamespace(actionRef.id);
  });

  test("typed operation calls enforce witness argument arity", () => {
    const predicate = kernel.defineExpr("literal", kernel.OPERATIONS.NOT.args[0]!);

    kernel.opCallTyped(kernel.OPERATIONS.NOT, [predicate]);

    // @ts-expect-error `op.not` accepts one argument
    kernel.opCallTyped(kernel.OPERATIONS.NOT, [predicate, predicate]);
  });
});
