/* @__NO_SIDE_EFFECTS__ */
/**
 * Composable graph authoring steps.
 *
 * A GraphStep is a typed fragment that transforms a KernelGraph. Runtime graph
 * shape stays broad and serializable; TypeScript carries authored witnesses
 * through fragment outputs for local API inference.
 */

import type { KernelEdge } from "./edge.ts";
import type { KernelExpr } from "./expr.ts";
import {
  createKernelGraph,
  registerEdge,
  registerExpr,
  registerNode,
  type KernelGraph,
} from "./graph.ts";
import type { KernelNode } from "./node.ts";
import {
  defaultPassRegistry,
  runNamedPipeline,
  type PassContext,
  type PassRegistry,
  type PipelineDef,
} from "./pass.ts";

export interface GraphStepState {
  readonly nodes: readonly KernelNode[];
  readonly edges: readonly KernelEdge[];
  readonly exprs: readonly KernelExpr[];
}

export type EmptyGraphStepState = {
  readonly nodes: readonly [];
  readonly edges: readonly [];
  readonly exprs: readonly [];
};

export type GraphStepNodeState<Node extends KernelNode> = {
  readonly nodes: readonly [Node];
  readonly edges: readonly [];
  readonly exprs: readonly [];
};

export type GraphStepEdgeState<Edge extends KernelEdge> = {
  readonly nodes: readonly [];
  readonly edges: readonly [Edge];
  readonly exprs: readonly [];
};

export type GraphStepExprState<Expr extends KernelExpr> = {
  readonly nodes: readonly [];
  readonly edges: readonly [];
  readonly exprs: readonly [Expr];
};

export type MergeGraphStepStates<Left extends GraphStepState, Right extends GraphStepState> = {
  readonly nodes: readonly [...Left["nodes"], ...Right["nodes"]];
  readonly edges: readonly [...Left["edges"], ...Right["edges"]];
  readonly exprs: readonly [...Left["exprs"], ...Right["exprs"]];
};

export type TypedKernelGraph<State extends GraphStepState = EmptyGraphStepState> = KernelGraph & {
  readonly _state?: State;
};

export type GraphStateOf<Graph> = Graph extends TypedKernelGraph<infer State> ? State : never;

export interface GraphStep<
  Input extends GraphStepState = EmptyGraphStepState,
  Output extends GraphStepState = Input,
> {
  readonly kind: "graph.step";
  readonly label?: string;
  readonly apply: (graph: KernelGraph) => KernelGraph;
  readonly _input?: Input;
  readonly _output?: Output;
}

export type GraphFragment<Output extends GraphStepState = GraphStepState> = GraphStep<
  EmptyGraphStepState,
  Output
>;

export type AnyGraphStep = GraphStep<any, any>;

export type GraphStepInputOf<Step> = Step extends GraphStep<infer Input, any> ? Input : never;

export type GraphStepOutputOf<Step> = Step extends GraphStep<any, infer Output> ? Output : never;

const createGraphStep = <Input extends GraphStepState, Output extends GraphStepState>(
  label: string,
  apply: (graph: KernelGraph) => KernelGraph,
): GraphStep<Input, Output> => ({
  kind: "graph.step",
  label,
  apply,
});

export const graphNode = <const Node extends KernelNode>(
  node: Node,
): GraphStep<EmptyGraphStepState, GraphStepNodeState<Node>> =>
  createGraphStep("node", (graph) => registerNode(graph, node));

export const graphEdge = <const Edge extends KernelEdge>(
  edge: Edge,
): GraphStep<EmptyGraphStepState, GraphStepEdgeState<Edge>> =>
  createGraphStep("edge", (graph) => registerEdge(graph, edge));

export const graphExpr = <const Expr extends KernelExpr>(
  expr: Expr,
): GraphStep<EmptyGraphStepState, GraphStepExprState<Expr>> =>
  createGraphStep("expr", (graph) => registerExpr(graph, expr));

export const graphPass = (
  name: string,
  input?: {
    readonly registry?: PassRegistry;
    readonly context?: PassContext;
  },
): GraphStep<EmptyGraphStepState, EmptyGraphStepState> =>
  createGraphStep(`pass:${name}`, (graph) => {
    const result = (input?.registry ?? defaultPassRegistry).run(name, graph, input?.context);
    return result.modifiedGraph ?? graph;
  });

export const graphPipeline = (
  pipeline: PipelineDef | string,
  input?: {
    readonly registry?: PassRegistry;
    readonly context?: PassContext & {
      readonly pipelineRegistry?: import("./pass.ts").PipelineRegistry;
    };
  },
): GraphStep<EmptyGraphStepState, EmptyGraphStepState> =>
  createGraphStep(
    `pipeline:${typeof pipeline === "string" ? pipeline : pipeline.name}`,
    (graph) =>
      runNamedPipeline(pipeline, graph, input?.registry ?? defaultPassRegistry, input?.context)
        .modifiedGraph ?? graph,
  );

export function graphFragment<const Step extends AnyGraphStep>(
  step: Step,
): GraphStep<EmptyGraphStepState, GraphStepOutputOf<Step>>;
export function graphFragment<const First extends AnyGraphStep, const Second extends AnyGraphStep>(
  first: First,
  second: Second,
): GraphStep<
  EmptyGraphStepState,
  MergeGraphStepStates<GraphStepOutputOf<First>, GraphStepOutputOf<Second>>
>;
export function graphFragment<
  const First extends AnyGraphStep,
  const Second extends AnyGraphStep,
  const Third extends AnyGraphStep,
>(
  first: First,
  second: Second,
  third: Third,
): GraphStep<
  EmptyGraphStepState,
  MergeGraphStepStates<
    MergeGraphStepStates<GraphStepOutputOf<First>, GraphStepOutputOf<Second>>,
    GraphStepOutputOf<Third>
  >
>;
export function graphFragment(
  ...steps: readonly AnyGraphStep[]
): GraphStep<EmptyGraphStepState, GraphStepState>;
export function graphFragment(
  ...steps: readonly AnyGraphStep[]
): GraphStep<EmptyGraphStepState, GraphStepState> {
  return createGraphStep("fragment", (graph) =>
    steps.reduce((current, step) => step.apply(current), graph),
  );
}

export const pipeGraphInto = (graph: KernelGraph, ...steps: readonly AnyGraphStep[]): KernelGraph =>
  steps.reduce((current, step) => step.apply(current), graph);

export function pipeGraph<const Step extends AnyGraphStep>(
  step: Step,
): TypedKernelGraph<GraphStepOutputOf<Step>>;
export function pipeGraph<const First extends AnyGraphStep, const Second extends AnyGraphStep>(
  first: First,
  second: Second,
): TypedKernelGraph<MergeGraphStepStates<GraphStepOutputOf<First>, GraphStepOutputOf<Second>>>;
export function pipeGraph<
  const First extends AnyGraphStep,
  const Second extends AnyGraphStep,
  const Third extends AnyGraphStep,
>(
  first: First,
  second: Second,
  third: Third,
): TypedKernelGraph<
  MergeGraphStepStates<
    MergeGraphStepStates<GraphStepOutputOf<First>, GraphStepOutputOf<Second>>,
    GraphStepOutputOf<Third>
  >
>;
export function pipeGraph(...steps: readonly AnyGraphStep[]): KernelGraph;
export function pipeGraph(...steps: readonly AnyGraphStep[]): KernelGraph {
  return pipeGraphInto(createKernelGraph(), ...steps);
}

export const graph = {
  pipe: pipeGraph,
  pipeInto: pipeGraphInto,
  fragment: graphFragment,
  node: graphNode,
  edge: graphEdge,
  expr: graphExpr,
  pass: graphPass,
  pipeline: graphPipeline,
} as const;

export const fragment = graphFragment;
export const nodeStep = graphNode;
export const edgeStep = graphEdge;
export const exprStep = graphExpr;
export const passStep = graphPass;
export const pipelineStep = graphPipeline;

export const buildGraphFromSteps = (...steps: readonly AnyGraphStep[]): KernelGraph =>
  pipeGraphInto(createKernelGraph(), ...steps);
