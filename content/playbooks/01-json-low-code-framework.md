---
id: playbook-json-low-code
category: playbooks
sequence: 1
title: Building a JSON Low-Code Framework
also_known_as: [Config-Driven UI, Schema-Driven Rendering]
gof: false
kind: playbook
intent: "Ship behavior as data — a JSON document describes a form, page, or rule, and a runtime turns it into a working UI or decision without a redeploy."
frequency: high
difficulty: advanced
tags: [playbook, low-code, json, config-as-data, runtime, dsl]
related: [interpreter, factory-method, composite, strategy, bridge, visitor, dependency-injection]
languages: []
---

## Intent

A low-code framework ships **behavior as data**. Instead of hand-coding each form and page,
you describe it as JSON — fields, layout, rules, data bindings — and a runtime turns that
document into a working UI or a decision. Change the JSON, change the app; no redeploy.

The katas in this catalog are the parts. This playbook is the assembly: which patterns you
reach for, why, and where each one is taught. It's the reverse of a kata — you start from the
system and walk back to the patterns.

## The Shape

```
 JSON schema ──▶ parser ──▶ node tree ─────▶ node factory ─────▶ renderer ──▶ UI
   (data)                  (Composite)     (per "type" field)   (Bridge)
                                │                                    ▲
                                ├── rules ──▶ Interpreter            │
                                └── bindings ──▶ datasource ─────────┘
                                                (Adapter + DI)
```

One recursive walk builds the tree; a factory turns each node's `"type"` into a real widget;
rules ride along as data the interpreter evaluates; a renderer draws the tree against whatever
backend you inject.

## The Patterns You'll Reach For

- **Factory Method / Abstract Factory** — the `"type"` discriminator on each node is dispatched
  to the matching widget constructor. This is the engine's core: *data names the type, the
  factory builds it*. An Abstract Factory swaps a whole widget family (web / native / print)
  behind one interface.
- **Composite** — the JSON tree itself. A `container` holds fields and other containers, and one
  recursive render treats a leaf field and a group alike.
- **Interpreter** — JSON rule trees (`{"and": [{"eq": ["role", "admin"]}, …]}`) parsed once and
  evaluated per record. Validation, visibility, and pricing rules live as data, not code.
- **Strategy** — a field's `"validator": "email"` or `"format": "currency"` selects a pluggable
  behavior by name straight from config; adding one is a new object, not a new branch.
- **Bridge** — keep the component abstraction apart from its renderer so one schema drives web,
  native, or PDF by swapping the implementor.
- **Visitor** — one pass over the node tree per operation: validate, compile, estimate render
  cost — add an operation without touching the node types.
- **Prototype / Flyweight** — clone a template node to seed a new section (Prototype); share one
  widget definition per `type` across thousands of instances (Flyweight).
- **Decorator** — wrap a field with permission and formatting layers declared in its JSON.
- **Adapter** — fit an external REST endpoint to the datasource interface a binding assumes.
- **Dependency Injection** — the runtime injects datasources, validators, and theme into the
  renderer, so the same schema runs against different backends and is testable with fakes.
- **Content-Based Router** — route a record to the form or handler named by a discriminator
  field.
- **Event Sourcing / Memento** — store every builder edit as an event (or snapshot) so undo and
  an audit trail come almost for free.

## How the Approach Changed

The kernel — *data describes behavior, a runtime interprets it* — is decades old. What moved is
who writes the data:

1. **Hardcoded** — every form is bespoke code; a new field is a deploy.
2. **Templating** — HTML templates pull dynamic values, but structure is still code.
3. **Config-driven** — a settings file toggles behavior; the shapes are fixed.
4. **JSON low-code** — the whole UI and its rules are a document; domain experts edit it in a
   visual builder, no developer in the loop.
5. **LLM-assisted** — a model *generates* the schema from a plain-English description, and the
   same runtime that always validated hand-written JSON now validates machine-written JSON.

The patterns didn't change. The author did — from developer, to domain expert, to model.

## Pitfalls

- **Reinventing a bad programming language.** The Interpreter kata's central warning: keep the
  DSL small and declarative. The moment your JSON grows loops and variables, you've built a
  worse language than the one you started in.
- **A god renderer.** One giant `switch (node.type)` instead of a factory registry. New widget
  types should be a new file, not another case (Open/Closed).
- **Welding schema to one target.** Skip the Bridge and you can't add native or PDF output later
  without rewriting the renderer.
- **Trusting user JSON.** Evaluating arbitrary uploaded rules is a security hole — whitelist
  operators, bound recursion, and sandbox the interpreter.

## Related Playbooks

- **Building a Workflow Engine** — a workflow definition *is* a low-code graph; the same
  data-describes-behavior kernel, applied to steps instead of fields.
- **Orchestrating Multi-Agent Tasks** — an agent's plan is a small DSL too, interpreted by a
  runtime rather than executed as raw code.
