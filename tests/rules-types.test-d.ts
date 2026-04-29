/**
 * Type-level tests for the rules package.
 *
 * Validates inference and type safety for rule definitions,
 * builder forms, expression constructors, and the namespace API.
 */
import { createGen } from "../src/index.ts";

const { gen } = createGen();

const User = gen.entity("User", { id: gen.types.uuid(), name: gen.types.string() });
const _Post = gen.entity("Post", {
  id: gen.types.uuid(),
  user_id: gen.types.uuid(),
  title: gen.types.string(),
});
void _Post;

// ---------------------------------------------------------------------------
// Rule definition — object form infers name and vars
// ---------------------------------------------------------------------------

const canViewPost = gen.rule.define({
  name: "canViewPost",
  vars: [
    { name: "actor", semanticType: gen.types.uuid() },
    { name: "post", semanticType: gen.types.uuid() },
  ],
  when: gen.rule.eq(
    gen.rule.field(User, User.fields.id, gen.types.uuid()),
    gen.rule.var("actor", gen.types.uuid()),
  ),
});

// Name should be inferred as literal
const _name: "canViewPost" = canViewPost.name;
void _name;

// Body should be a RuleExpr<boolean>
const _body = canViewPost.body;
void _body;

// ---------------------------------------------------------------------------
// Rule definition — builder callback form infers name and vars
// ---------------------------------------------------------------------------

const canEditPost = gen.rule.define((b) =>
  b
    .name("canEditPost")
    .vars({ actor: gen.types.uuid(), post: gen.types.uuid() })
    .when((_ctx) =>
      gen.rule.and(
        gen.rule.eq(
          gen.rule.var("actor", gen.types.uuid()),
          gen.rule.var("actor", gen.types.uuid()),
        ),
        gen.rule.eq(gen.rule.var("post", gen.types.uuid()), gen.rule.var("post", gen.types.uuid())),
      ),
    ),
);

const _editName: "canEditPost" = canEditPost.name;
void _editName;

// ---------------------------------------------------------------------------
// Expression constructors preserve phantom types
// ---------------------------------------------------------------------------

const lit = gen.rule.literal("hello", gen.types.string());
const _litValue: string = lit.value;
void _litValue;

const fld = gen.rule.field(User, User.fields.name, gen.types.string());
const _fldName: string = fld.field.name;
void _fldName;

const cmp = gen.rule.compare(
  "gt",
  gen.rule.literal(1, gen.types.int()),
  gen.rule.literal(2, gen.types.int()),
);
const _cmpOp: "gt" | "lt" | "lte" | "gte" = cmp.op;
void _cmpOp;

// ---------------------------------------------------------------------------
// Boolean composition requires boolean terms (type-level)
// ---------------------------------------------------------------------------

// @ts-expect-error — rule.and expects boolean expressions, not literal numbers
const badAnd = gen.rule.and(gen.rule.literal(1, gen.types.int()));
void badAnd;

// @ts-expect-error — rule.or expects boolean expressions, not literal strings
const badOr = gen.rule.or(gen.rule.literal("x", gen.types.string()));
void badOr;

// @ts-expect-error — rule.not expects boolean expression, not a number literal
const badNot = gen.rule.not(gen.rule.literal(1, gen.types.int()));
void badNot;

// ---------------------------------------------------------------------------
// exists requires a Relation, not an Entity
// ---------------------------------------------------------------------------

// This is verified at runtime by checkRules; at the type level the call
// site may still type-check because Relation and Entity share structural
// overlap in some configurations. The runtime diagnostic is the canonical
// enforcement for MVP.
const rel = gen.relation({
  name: "author",
  kind: "many_to_one",
  from_entity: _Post,
  to_entity: User,
  from_field: _Post.fields.user_id,
  to_field: User.fields.id,
});
const goodExists = gen.rule.exists(
  rel,
  gen.rule.eq(gen.rule.literal(1, gen.types.int()), gen.rule.literal(1, gen.types.int())),
);
void goodExists;

// ---------------------------------------------------------------------------
// Dependency extraction returns correct shape
// ---------------------------------------------------------------------------

const deps = gen.rule.dependencies(canViewPost);
const _entities = deps.entities;
const _fields = deps.fields;
const _variables = deps.variables;
void _entities;
void _fields;
void _variables;

// ---------------------------------------------------------------------------
// Namespace methods exist and are callable
// ---------------------------------------------------------------------------

const _translateSql: typeof gen.rule.translateSql = gen.rule.translateSql;
const _translateSqlWithBindings: typeof gen.rule.translateSqlWithBindings =
  gen.rule.translateSqlWithBindings;
const _evaluate: typeof gen.rule.evaluate = gen.rule.evaluate;
const _analyzePlacement: typeof gen.rule.analyzePlacement = gen.rule.analyzePlacement;
void _translateSql;
void _translateSqlWithBindings;
void _evaluate;
void _analyzePlacement;
