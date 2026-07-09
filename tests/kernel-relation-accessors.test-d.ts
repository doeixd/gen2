import { describe, expectTypeOf, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";

const FolderKind = kernel.defineNodeKind({ id: "node.kind.test.dx.folder" });
const FileKind = kernel.defineNodeKind({ id: "node.kind.test.dx.file" });
const TagKind = kernel.defineNodeKind({ id: "node.kind.test.dx.tag" });

const ContainsEdge = kernel.defineEdgeKind({
  id: "edge.kind.test.dx.contains",
  endpoints: [
    kernel.defineEndpointRole("folder", { targetKinds: [FolderKind] }),
    kernel.defineEndpointRole("file", { targetKinds: [FileKind] }),
  ],
});

const TagEdge = kernel.defineEdgeKind({
  id: "edge.kind.test.dx.tag",
  endpoints: [
    kernel.defineEndpointRole("file", { targetKinds: [FileKind] }),
    kernel.defineEndpointRole("tag", { targetKinds: [TagKind] }),
  ],
});

const FolderWithFiles = FolderKind.relations({
  files: kernel.hasMany(FileKind, { via: ContainsEdge, min: 1 }),
});

const FileWithRelations = FileKind.relations({
  tag: kernel.hasOne(TagKind, { via: TagEdge }),
  optionalTag: kernel.hasOne(TagKind, { via: TagEdge }).optional(),
  allTags: kernel.hasMany(TagKind, { via: TagEdge }),
});

describe("runtime relation accessor types", () => {
  test("hasMany(..., min: 1) infers a non-empty tuple return", () => {
    const folder = kernel.defineNodeFromKind(FolderKind, "node:test:dx:folder");
    const graph = kernel.createGraphBuilder().node(folder).done();
    const acc = kernel.related(graph, folder, FolderWithFiles);

    expectTypeOf(acc.files).toBeFunction();
    expectTypeOf(acc.files()).toMatchTypeOf<readonly kernel.KernelNodeRef[]>();
    // Non-empty tuple shape (first element is required).
    type Files = ReturnType<typeof acc.files>;
    expectTypeOf<
      Files extends readonly [infer _Head, ...infer _Rest] ? true : false
    >().toEqualTypeOf<true>();
  });

  test("hasOne (1..1) infers a single ref return without undefined", () => {
    const file = kernel.defineNodeFromKind(FileKind, "node:test:dx:file");
    const graph = kernel.createGraphBuilder().node(file).done();
    const acc = kernel.related(graph, file, FileWithRelations);

    expectTypeOf(acc.tag()).toMatchTypeOf<kernel.KernelNodeRef>();
    // The 1..1 return type does NOT include undefined.
    type TagReturn = ReturnType<typeof acc.tag>;
    expectTypeOf<undefined extends TagReturn ? true : false>().toEqualTypeOf<false>();
  });

  test("hasOne(...).optional() infers a `Ref | undefined` return", () => {
    const file = kernel.defineNodeFromKind(FileKind, "node:test:dx:file2");
    const graph = kernel.createGraphBuilder().node(file).done();
    const acc = kernel.related(graph, file, FileWithRelations);

    type OptReturn = ReturnType<typeof acc.optionalTag>;
    expectTypeOf<undefined extends OptReturn ? true : false>().toEqualTypeOf<true>();
  });

  test("default hasMany (0..N) infers a plain readonly array return", () => {
    const file = kernel.defineNodeFromKind(FileKind, "node:test:dx:file3");
    const graph = kernel.createGraphBuilder().node(file).done();
    const acc = kernel.related(graph, file, FileWithRelations);

    expectTypeOf(acc.allTags()).toMatchTypeOf<readonly kernel.KernelNodeRef[]>();
    // Plain array, NOT a non-empty tuple.
    type AllReturn = ReturnType<typeof acc.allTags>;
    expectTypeOf<
      AllReturn extends readonly [unknown, ...unknown[]] ? true : false
    >().toEqualTypeOf<false>();
  });

  test("accessor object keys match the relation schema keys", () => {
    const file = kernel.defineNodeFromKind(FileKind, "node:test:dx:file4");
    const graph = kernel.createGraphBuilder().node(file).done();
    const acc = kernel.related(graph, file, FileWithRelations);

    expectTypeOf<keyof typeof acc>().toEqualTypeOf<"tag" | "optionalTag" | "allTags">();
  });
});
