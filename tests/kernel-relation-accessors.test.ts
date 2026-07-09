/**
 * Runtime tests for `related(graph, node, kind)` accessors (§B0a).
 *
 * Exercises a small dialect-shaped graph with a parent/children edge family
 * and a 1..1 binding edge to validate cardinality handling.
 */
import { expect, test } from "vite-plus/test";
import { kernel } from "../src/index.ts";

const FolderKind = kernel.defineNodeKind({ id: "node.kind.test.folder" });
const FileKind = kernel.defineNodeKind({ id: "node.kind.test.file" });
const TagKind = kernel.defineNodeKind({ id: "node.kind.test.tag" });

const FolderToFileEdge = kernel.defineEdgeKind({
  id: "edge.kind.test.folderContainsFile",
  endpoints: [
    kernel.defineEndpointRole("folder", { targetKinds: [FolderKind] }),
    kernel.defineEndpointRole("file", { targetKinds: [FileKind] }),
  ],
});

const FileToTagEdge = kernel.defineEdgeKind({
  id: "edge.kind.test.fileHasTag",
  endpoints: [
    kernel.defineEndpointRole("file", { targetKinds: [FileKind] }),
    kernel.defineEndpointRole("tag", { targetKinds: [TagKind] }),
  ],
});

const FolderWithChildren = FolderKind.relations({
  files: kernel.hasMany(FileKind, { via: FolderToFileEdge, min: 1 }),
});

const FileWithRelations = FileKind.relations({
  tag: kernel.hasOne(TagKind, { via: FileToTagEdge }),
  optionalTag: kernel.hasOne(TagKind, { via: FileToTagEdge }).optional(),
  allTags: kernel.hasMany(TagKind, { via: FileToTagEdge }),
});

const buildFolderWithFiles = () => {
  const folder = kernel.defineNodeFromKind(FolderKind, "node:folder:root", { name: "root" });
  const file1 = kernel.defineNodeFromKind(FileKind, "node:file:a", { name: "a.txt" });
  const file2 = kernel.defineNodeFromKind(FileKind, "node:file:b", { name: "b.txt" });

  const folderRef = kernel.refOf(folder);
  const file1Ref = kernel.refOf(file1);
  const file2Ref = kernel.refOf(file2);

  const edge1 = kernel.defineEdgeFromKind(FolderToFileEdge, "edge:contains:a", {
    folder: folderRef,
    file: file1Ref,
  });
  const edge2 = kernel.defineEdgeFromKind(FolderToFileEdge, "edge:contains:b", {
    folder: folderRef,
    file: file2Ref,
  });

  const graph = kernel
    .createGraphBuilder()
    .node(folder)
    .node(file1)
    .node(file2)
    .edge(edge1)
    .edge(edge2)
    .done();

  return { graph, folder, file1, file2 };
};

test("related(graph, node, kind) returns hasMany targets as an array", () => {
  const { graph, folder } = buildFolderWithFiles();
  const accessors = kernel.related(graph, folder, FolderWithChildren);

  const files = accessors.files();
  expect(Array.isArray(files)).toBe(true);
  expect(files).toHaveLength(2);
  expect(new Set(files.map((f) => String(f.id)))).toEqual(new Set(["node:file:a", "node:file:b"]));
  expect(files[0]!.nodeKind.id).toBe(FileKind.id);
});

test("related accessors return a single ref for hasOne (1..1)", () => {
  const file = kernel.defineNodeFromKind(FileKind, "node:file:tagged");
  const tag = kernel.defineNodeFromKind(TagKind, "node:tag:urgent");

  const edge = kernel.defineEdgeFromKind(FileToTagEdge, "edge:tag:1", {
    file: kernel.refOf(file),
    tag: kernel.refOf(tag),
  });

  const graph = kernel.createGraphBuilder().node(file).node(tag).edge(edge).done();
  const accessors = kernel.related(graph, file, FileWithRelations);

  const tagRef = accessors.tag();
  expect(tagRef).toBeDefined();
  expect(String(tagRef!.id)).toBe("node:tag:urgent");
  expect(tagRef!.nodeKind.id).toBe(TagKind.id);
});

test("optional hasOne accessor returns undefined when no edges exist", () => {
  const file = kernel.defineNodeFromKind(FileKind, "node:file:bare");

  const graph = kernel.createGraphBuilder().node(file).done();
  const accessors = kernel.related(graph, file, FileWithRelations);

  expect(accessors.optionalTag()).toBeUndefined();
  expect(accessors.allTags()).toEqual([]);
});

test("hasMany accessor returns empty array when no matching edges exist", () => {
  const folder = kernel.defineNodeFromKind(FolderKind, "node:folder:empty");
  const graph = kernel.createGraphBuilder().node(folder).done();
  const accessors = kernel.related(graph, folder, FolderWithChildren);

  expect(accessors.files()).toEqual([]);
});

test("checkRelations emits underflow error when hasMany(min:1) has zero matches", () => {
  const folder = kernel.defineNodeFromKind(FolderKind, "node:folder:emptyCheck");
  const graph = kernel.createGraphBuilder().node(folder).done();

  const diagnostics = kernel.checkRelations(graph, folder, FolderWithChildren);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]!.code).toBe("relation:underflow");
  expect(diagnostics[0]!.severity).toBe("error");
  expect(diagnostics[0]!.message).toContain("expected at least 1");
});

test("checkRelations emits underflow for a required hasOne (1..1) with no edges", () => {
  const file = kernel.defineNodeFromKind(FileKind, "node:file:noTag");
  const graph = kernel.createGraphBuilder().node(file).done();

  const diagnostics = kernel.checkRelations(graph, file, FileWithRelations);
  // `tag` (1..1) underflows; `optionalTag` (0..1) and `allTags` (0..N) do not.
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]!.message).toContain('"tag"');
  expect(diagnostics[0]!.code).toBe("relation:underflow");
});

test("checkRelations emits no diagnostics when all relations are satisfied", () => {
  const { graph, folder } = buildFolderWithFiles();
  const diagnostics = kernel.checkRelations(graph, folder, FolderWithChildren);
  expect(diagnostics).toEqual([]);
});

test("checkRelations emits overflow warning when hasOne (1..1) has multiple matches", () => {
  const file = kernel.defineNodeFromKind(FileKind, "node:file:multiTag");
  const tag1 = kernel.defineNodeFromKind(TagKind, "node:tag:one");
  const tag2 = kernel.defineNodeFromKind(TagKind, "node:tag:two");
  const e1 = kernel.defineEdgeFromKind(FileToTagEdge, "edge:over:1", {
    file: kernel.refOf(file),
    tag: kernel.refOf(tag1),
  });
  const e2 = kernel.defineEdgeFromKind(FileToTagEdge, "edge:over:2", {
    file: kernel.refOf(file),
    tag: kernel.refOf(tag2),
  });
  const graph = kernel
    .createGraphBuilder()
    .node(file)
    .node(tag1)
    .node(tag2)
    .edge(e1)
    .edge(e2)
    .done();

  const diagnostics = kernel.checkRelations(graph, file, FileWithRelations);
  // `tag` (1..1) overflows with 2 matches; `optionalTag` (0..1) also overflows.
  const overflows = diagnostics.filter((d) => d.code === "relation:overflow");
  expect(overflows.length).toBeGreaterThanOrEqual(1);
  expect(overflows[0]!.severity).toBe("warning");
});

test("inverse accessors auto-derive from peer relations targeting this kind", () => {
  // Folder declares `files: hasMany(FileKind)`. Passing `FolderWithChildren`
  // as a peer when looking up a File should expose an inverse `file` ↔ `folder`
  // accessor on the File side.
  const { graph, file1, folder } = buildFolderWithFiles();

  const acc = kernel.related(graph, file1, FileWithRelations, {
    peers: [FolderWithChildren],
  });

  // The inverse accessor name is the peer's id's last dotted segment.
  const inverse = (acc as unknown as { folder: () => readonly { id: string }[] }).folder;
  expect(typeof inverse).toBe("function");
  const folderRefs = inverse();
  expect(folderRefs).toHaveLength(1);
  expect(String(folderRefs[0]!.id)).toBe(folder.id);
});

test("inverse accessor returns empty array when no peer node references this target", () => {
  const file = kernel.defineNodeFromKind(FileKind, "node:file:isolated");
  const graph = kernel.createGraphBuilder().node(file).done();

  const acc = kernel.related(graph, file, FileWithRelations, {
    peers: [FolderWithChildren],
  });
  const inverse = (acc as unknown as { folder: () => readonly unknown[] }).folder;
  expect(inverse()).toEqual([]);
});

test("inverse accessors collect multiple peers referencing the same target", () => {
  const folder1 = kernel.defineNodeFromKind(FolderKind, "node:folder:multi:1");
  const folder2 = kernel.defineNodeFromKind(FolderKind, "node:folder:multi:2");
  const shared = kernel.defineNodeFromKind(FileKind, "node:file:shared");

  const e1 = kernel.defineEdgeFromKind(FolderToFileEdge, "edge:multi:1", {
    folder: kernel.refOf(folder1),
    file: kernel.refOf(shared),
  });
  const e2 = kernel.defineEdgeFromKind(FolderToFileEdge, "edge:multi:2", {
    folder: kernel.refOf(folder2),
    file: kernel.refOf(shared),
  });

  const graph = kernel
    .createGraphBuilder()
    .node(folder1)
    .node(folder2)
    .node(shared)
    .edge(e1)
    .edge(e2)
    .done();

  const acc = kernel.related(graph, shared, FileWithRelations, {
    peers: [FolderWithChildren],
  });
  const folders = (acc as unknown as { folder: () => readonly { id: string }[] }).folder();
  expect(folders).toHaveLength(2);
  expect(new Set(folders.map((f) => String(f.id)))).toEqual(
    new Set(["node:folder:multi:1", "node:folder:multi:2"]),
  );
});

test("accessors only follow edges where the source endpoint is the source node", () => {
  // Two folders; file1 belongs to folder1, file2 belongs to folder2.
  // Verify folder1.files() only returns file1.
  const folder1 = kernel.defineNodeFromKind(FolderKind, "node:folder:1");
  const folder2 = kernel.defineNodeFromKind(FolderKind, "node:folder:2");
  const file1 = kernel.defineNodeFromKind(FileKind, "node:file:1");
  const file2 = kernel.defineNodeFromKind(FileKind, "node:file:2");

  const e1 = kernel.defineEdgeFromKind(FolderToFileEdge, "edge:1", {
    folder: kernel.refOf(folder1),
    file: kernel.refOf(file1),
  });
  const e2 = kernel.defineEdgeFromKind(FolderToFileEdge, "edge:2", {
    folder: kernel.refOf(folder2),
    file: kernel.refOf(file2),
  });

  const graph = kernel
    .createGraphBuilder()
    .node(folder1)
    .node(folder2)
    .node(file1)
    .node(file2)
    .edge(e1)
    .edge(e2)
    .done();

  const acc1 = kernel.related(graph, folder1, FolderWithChildren);
  const files1 = acc1.files();
  expect(files1).toHaveLength(1);
  expect(String(files1[0]!.id)).toBe("node:file:1");
});
