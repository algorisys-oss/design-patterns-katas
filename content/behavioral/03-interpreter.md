---
id: interpreter
category: behavioral
sequence: 3
title: Interpreter
also_known_as: [Little Language]
gof: true
intent: "Define a grammar for a small language and an interpreter that evaluates its sentences."
frequency: low
difficulty: advanced
tags: [behavioral, grammar, ast, dsl, rules-engine, parsing]
related: [composite, visitor, iterator]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Given a language with a simple, well-defined grammar, represent each grammar rule as a class
(or a function, or a data variant) and write an interpreter that walks a sentence's tree and
evaluates it. The sentence becomes an abstract syntax tree; interpreting it means recursing
over that tree.

This is the pattern behind rules engines, query languages, formula evaluators, and small
DSLs — anything where *data or text describes behavior* and something has to evaluate it.

## The Problem

You want users to configure eligibility rules — "age over 18 and country is US" — without
redeploying. The tempting shortcut is to evaluate the string directly:

```
function eligible(expr, context) {
  return eval(expr); // "context.age > 18 && context.country === 'US'"
}
```

`eval` is a security hole (arbitrary code execution on any input), it only speaks JavaScript
(not your domain), and it gives you no control over the semantics. Interpreter replaces it with
a small grammar you define, a tree you build from the input, and an evaluator you own.

## Structure

Key Components:

- **AbstractExpression** — the interface every node implements: `interpret(context)`.
- **TerminalExpression** — a leaf: a literal, a variable, a single comparison. Interprets directly.
- **NonTerminalExpression** — a composite: combines child expressions (`add`, `and`, `or`).
  Interprets by recursing into its children.
- **Context** — the input the interpretation runs against (variable bindings, the data row).
- **Client** — builds the tree (usually via a parser) and calls `interpret` on the root.

```
"1 + 2 * 3"  →  parse  →        Add
                              /      \
                           Num(1)    Mul          →  interpret(root) → 7
                                    /   \
                                 Num(2) Num(3)
```

## When to Use

- You have a simple, stable grammar and want to evaluate its sentences repeatedly.
- You want configuration or text — a DSL — to drive behavior instead of hard-coded logic.
- The grammar is small: a handful of rules, not a full programming language.
- Rules engines, query filters, math/formula evaluation, template expansion.

## Advantages and Disadvantages

### Advantages
- The grammar is explicit and each rule lives in one place — easy to reason about and extend
  with new node types.
- Behavior becomes data: rules ship as config, not code.
- The tree is a Composite, so evaluation is a clean recursion.

### Disadvantages
- Grammars of any real size explode into a class (or clause) per rule — unmaintainable fast.
- It only *evaluates* a tree; you still need a lexer/parser to build the tree from text.
- Deep recursion over large sentences can be slow and stack-hungry.

## Common Mistakes

- **Using it for a large grammar** — beyond a dozen rules, hand-rolled Interpreter collapses;
  reach for a parser generator (PEG, ANTLR) or a real parser library instead.
- **Forgetting the parser** — Interpreter is the *evaluate-the-tree* half. Building the AST from
  raw text (lexing + parsing) is a separate job the pattern doesn't cover.
- **Falling back to `eval`** — convenient, but it's an injection hole and gives you none of the
  custom semantics that are the whole point.
- **Mistaking it for a whole compiler** — Interpreter evaluates; it doesn't optimize, type-check,
  or emit code.

## Key Takeaways

- Interpreter = one node type per grammar rule + a recursive `interpret` over the tree.
- The AST is a Composite; interpreting is a depth-first walk.
- It shines on small, stable DSLs and rules engines — and only there.
- Where to put `interpret` (inside each node vs. outside in a Visitor) is the Expression Problem.

## Implementations

An arithmetic mini-language: `Num` is the terminal, `Add` and `Mul` are non-terminals. The tree
for `1 + 2 * 3` interprets to `7`.

### JavaScript

**❌ Naive**

```js
// "Just eval it" — works until the input isn't trusted or isn't JavaScript.
function evaluate(expr) {
  return eval(expr); // 🚨 arbitrary code execution; no custom grammar, no domain rules
}
evaluate("1 + 2 * 3"); // 7 — but a hostile string runs anything, and you can't extend the language
```

**✅ Idiomatic (frontend)**

```js
// One class per grammar rule; each knows how to interpret itself.
class Num {
  constructor(n) { this.n = n; }
  interpret() { return this.n; }              // terminal
}
class Add {
  constructor(l, r) { this.l = l; this.r = r; }
  interpret() { return this.l.interpret() + this.r.interpret(); } // non-terminal
}
class Mul {
  constructor(l, r) { this.l = l; this.r = r; }
  interpret() { return this.l.interpret() * this.r.interpret(); }
}

// The AST for "1 + 2 * 3" (a parser would build this from text):
const expr = new Add(new Num(1), new Mul(new Num(2), new Num(3)));
expr.interpret(); // 7
```

**🧠 Tradeoff** — Putting `interpret` on each node is the textbook form: adding a new node type
(say `Sub`) needs no changes to the existing ones. The cost is the mirror image — adding a new
*operation* over the tree (pretty-print, optimize) means editing every class. That asymmetry is
the Expression Problem, and it's exactly what Visitor trades the other way.

### Node.js

**❌ Naive**

```js
// A rules check frozen into code — every new rule is a redeploy.
function eligible(user) {
  return user.age > 18 && user.country === "US"; // can't change without shipping
}
```

**✅ Idiomatic (backend)**

```js
// A JSON rules engine: terminals are comparisons, non-terminals are all/any combinators.
const compare = ({ field, op, value }) => (ctx) => {
  switch (op) {
    case ">":  return ctx[field] > value;
    case "==": return ctx[field] === value;
    default:   throw new Error(`unknown op: ${op}`);
  }
};
const all = (rules) => (ctx) => rules.every((r) => r(ctx));
const any = (rules) => (ctx) => rules.some((r) => r(ctx));

// Compile a JSON sentence into an interpreter (this is the parse step):
function build(node) {
  if (node.all) return all(node.all.map(build));
  if (node.any) return any(node.any.map(build));
  return compare(node);                         // terminal
}

const rule = build({
  all: [{ field: "age", op: ">", value: 18 }, { field: "country", op: "==", value: "US" }],
});
rule({ age: 21, country: "US" }); // true — and the rule shipped as data, not code
```

**🧠 Tradeoff** — Closures instead of classes give a lighter interpreter — no node hierarchy —
and the JSON *is* a sentence in the grammar, so rules become editable config. This is how
feature-flag and pricing engines work. The moment you need real syntax (operator precedence,
arbitrary nesting, helpful parse errors), stop hand-rolling and reach for a parser library.

### Python

**❌ Naive**

```python
def evaluate(expr: str) -> int:
    return eval(expr)  # same injection hole and JS-only semantics, in Python

evaluate("1 + 2 * 3")  # 7
```

**✅ Idiomatic**

```python
from dataclasses import dataclass

# Nodes are data; the interpreter is one pattern-matched function.
@dataclass
class Num:
    value: int

@dataclass
class Add:
    left: "Expr"
    right: "Expr"

@dataclass
class Mul:
    left: "Expr"
    right: "Expr"

Expr = Num | Add | Mul

def interpret(node: Expr) -> int:
    match node:
        case Num(v):    return v
        case Add(l, r): return interpret(l) + interpret(r)
        case Mul(l, r): return interpret(l) * interpret(r)
        case _:         raise ValueError(f"unknown node: {node}")

expr = Add(Num(1), Mul(Num(2), Num(3)))
interpret(expr)  # 7
```

**🧠 Tradeoff** — Dataclasses plus `match` keep the whole interpreter in one function — very
readable, and adding an *operation* is just another function. The tradeoff flips from the OO
form: adding a new *node type* means touching every `match`. Pick the axis you expect to grow;
here Python's structural pattern matching makes the data-oriented side the natural default.

### Elixir

**❌ Naive**

```elixir
# Code.eval_string is Elixir's eval — same trust problem, plus it compiles at runtime.
defmodule Evaluator do
  def evaluate(expr), do: Code.eval_string(expr) |> elem(0)
end

Evaluator.evaluate("1 + 2 * 3")  # 7 — but never on untrusted input
```

**✅ Idiomatic**

```elixir
# The AST is plain tagged tuples; interpreting is pattern-matched function clauses.
defmodule Interpreter do
  def eval({:num, n}), do: n
  def eval({:add, l, r}), do: eval(l) + eval(r)
  def eval({:mul, l, r}), do: eval(l) * eval(r)
end

expr = {:add, {:num, 1}, {:mul, {:num, 2}, {:num, 3}}}
Interpreter.eval(expr)  # 7
```

**🧠 Tradeoff** — Tagged tuples and multiple function heads *are* the interpreter — no classes,
no dispatch machinery, the compiler checks your clauses. It's the most direct expression of the
pattern in any of these languages. As with Python, new operations are cheap (another function),
new node types touch every clause — the same Expression-Problem tradeoff, made explicit by the
data-first style.

### Go

**❌ Naive**

```go
// A hard-coded evaluator: no grammar, every new expression is new code.
func evaluate(op string, a, b int) int {
	switch op {
	case "+":
		return a + b
	case "*":
		return a * b
	}
	panic("unknown op") // can't nest, can't extend from data
}
```

**✅ Idiomatic**

```go
package expr

// Expr is the AbstractExpression: everything that can be interpreted.
type Expr interface {
	Interpret() int
}

type Num int

func (n Num) Interpret() int { return int(n) } // terminal

type Add struct{ L, R Expr }

func (a Add) Interpret() int { return a.L.Interpret() + a.R.Interpret() } // non-terminal

type Mul struct{ L, R Expr }

func (m Mul) Interpret() int { return m.L.Interpret() * m.R.Interpret() }

// Add{Num(1), Mul{Num(2), Num(3)}}.Interpret() == 7
```

**🧠 Tradeoff** — A small `Expr` interface with each node implementing `Interpret()` is the
idiomatic Go form — implicit satisfaction means no `extends`, just a method. Like the JS class
version, it's open to new node types and closed to new operations. Go has no pattern matching, so
the data-first alternative (a type switch over a tagged struct) reads worse than the interface
here — the method-per-node form is the one to reach for.

## Applications

Real-world uses of Interpreter (from the reference article), by tier:

- **Frontend** — form/eligibility rule engines, command languages for UI actions
  (`show #panel` / `hide #panel`), Markdown-to-HTML rendering, spreadsheet-formula evaluation,
  search-query mini-languages.
- **Backend** — JSON/YAML rules engines (pricing, eligibility, feature flags), SQL-like query
  interpreters over in-memory data, config DSLs, arithmetic/expression evaluators, policy engines.
- **Both** — calculators, template languages, and any small, stable DSL where behavior is
  described as data.

**In modern systems:**

- **Low-code** — a JSON rule tree (`{"and": [{"eq": ["role", "admin"]}, …]}`) parsed once and
  evaluated per record. This *is* the core of a JSON low-code engine: behavior shipped as data.
- **Workflow engine** — step conditions and transition guards written as data, interpreted to
  decide which node runs next, so the flow is editable without a redeploy.
- **Multi-agent** — an agent's plan expressed as a small step DSL the runtime walks, rather than
  free-form generated code you have to sandbox and trust.

## Related Patterns

- **Composite** — an AST *is* a Composite tree; Interpreter adds the `interpret` operation that
  recurses over it.
- **Visitor** — the other way to evaluate an AST: Visitor keeps operations outside the node types
  (easy to add operations, hard to add nodes), classic Interpreter keeps `interpret` inside them
  (easy to add nodes, hard to add operations) — the two halves of the Expression Problem.
- **Iterator** — commonly used to walk the token stream while parsing text into the tree.
