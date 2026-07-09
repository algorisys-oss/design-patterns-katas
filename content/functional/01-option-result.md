---
id: option-result
category: functional
sequence: 1
title: Option / Result
also_known_as: [Maybe, Either, Optional]
gof: false
intent: "Model absence and failure as ordinary values — an Option that's Some or None, a Result that's Ok or Err — so the compiler and the reader can't ignore the case that something isn't there or went wrong."
frequency: high
difficulty: intermediate
tags: [functional, error-handling, null-safety, values, composition]
related: [function-composition, immutability, retry]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Instead of returning `null` for "no value" or throwing an exception for "it failed," return a
**value that encodes the outcome**: an **Option** (`Some(x)` or `None`) for presence/absence, or a
**Result** (`Ok(x)` or `Err(e)`) for success/failure. The two possibilities live in the type, so
callers must acknowledge both to get at the value.

The payoff is that "it might not be there" and "it might fail" stop being invisible landmines.
There's no `null` to forget to check and no exception to forget to catch — the *shape of the return
value* forces the handling, and these values compose (`map`, `andThen`) so a chain of fallible steps
reads linearly and short-circuits on the first problem.

## The Problem

`null` and exceptions both hide the failure case from the type and the reader:

- **The billion-dollar mistake** — `null` looks like a valid value until you dereference it; the
  `NullPointerException`/`undefined is not a function` surfaces far from the missing check.
- **Invisible failure** — a function that *might* throw has the same signature as one that can't;
  nothing tells the caller to handle it, so they don't.
- **Scattered defensive checks** — every call site sprinkles `if (x != null)` and `try/catch`,
  cluttering the happy path and easy to miss one.
- **No composition** — chaining several fallible steps with null-checks or nested try/catch pyramids
  quickly.

## Structure

Key Components:

- **Option / Maybe** — a container that is either `Some(value)` or `None`; models absence.
- **Result / Either** — either `Ok(value)` / `Err(error)` (or `Right`/`Left`); models
  success-or-failure with an error payload.
- **Combinators** — `map` (transform the success value), `andThen`/`flatMap` (chain another fallible
  step), `unwrapOr`/`getOrElse` (supply a default), `match` (handle both cases).
- **Caller** — must `match`/`map` to reach the value, so the empty/error case is never skipped.

```
run(x) ──► Result<T, E> = Ok(T) | Err(E)
                │
                ├── map(f) ──► Ok(f(T))  |  Err passes through
                └── match ──► handle Ok and Err explicitly
```

## When to Use

- A function may legitimately have no result (a lookup that can miss) — return `Option`.
- A function can fail with a meaningful reason — return `Result` instead of throwing.
- You want fallible steps to compose without nested try/catch or null checks.
- The absence/failure case is important enough that callers *must not* forget it.

## Advantages and Disadvantages

### Advantages
- **Explicit** — the possibility of nothing/failure is in the type; callers can't ignore it.
- **Composable** — `map`/`andThen` chain fallible steps and short-circuit on the first failure.
- **No surprise nulls or exceptions** — the happy path stays clean and the failure path is total.

### Disadvantages
- **Ceremony in some languages** — wrapping/unwrapping adds boilerplate where the language lacks
  first-class support or pattern matching.
- **Not for truly exceptional cases** — genuine bugs and unrecoverable states are often better as
  exceptions/panics than as `Result` threaded everywhere.
- **Interop friction** — mixing with code that throws or returns null means converting at the
  boundaries.

## Common Mistakes

- **Unwrapping without checking** — force-unwrapping (`.unwrap()`, `.get()`, `!`) reintroduces the
  null/exception crash you were avoiding; handle both cases.
- **Using it for control flow bugs** — modeling programmer errors as `Err` instead of failing fast
  hides bugs; reserve Result for *expected* failures.
- **Losing the error type** — collapsing every `Err` to a string or boolean discards the information
  a caller needs to react; keep meaningful error values.
- **Nesting instead of chaining** — manually matching at every step instead of `andThen` recreates
  the pyramid; compose with combinators.

## Key Takeaways

- Return `Option`/`Result` values instead of `null`/exceptions so absence and failure are explicit.
- Callers must `match`/`map` to reach the value — the empty/error case can't be silently skipped.
- `map`/`andThen` compose fallible steps and short-circuit, keeping chains linear.
- Reserve it for *expected* absence/failure; use exceptions/panics for genuine bugs.

## Implementations

### JavaScript

**❌ Naive**

```js
// null-or-throw: the caller has no signal that either can happen.
function findUser(id) {
  const u = db.get(id);
  if (!u) return null;          // absence as null
  if (u.banned) throw new Error("banned"); // failure as exception
  return u;
}
// caller: forgets the null check → "cannot read property of null"
```

**✅ Idiomatic**

```js
// Return a tagged result; map/chain compose; match forces handling.
const Ok = (value) => ({ ok: true, value });
const Err = (error) => ({ ok: false, error });
const map = (r, f) => (r.ok ? Ok(f(r.value)) : r);           // transform Ok, pass Err
const andThen = (r, f) => (r.ok ? f(r.value) : r);           // chain fallible steps

function findUser(id) {
  const u = db.get(id);
  if (!u) return Err("not_found");
  if (u.banned) return Err("banned");
  return Ok(u);
}
// caller must look at both:
const r = andThen(findUser(id), (u) => Ok(u.email));
if (!r.ok) return render(r.error);   // can't reach .value without acknowledging r.ok
```

**🧠 Tradeoff** — A tiny tagged `{ok, value|error}` plus `map`/`andThen` brings explicit,
composable results to JS without a library; the caller has to consult `r.ok` to get the value.
Libraries (fp-ts, Effect, neverthrow) add richer types and TypeScript inference. JS's lack of
pattern matching makes the ergonomics a bit clunkier than in typed FP languages — the discipline is
yours to keep.

### Node.js

**❌ Naive**

```js
// Callback-era "error-first" is a poor-man's Result; async throws lose the signal.
async function loadConfig(path) {
  const text = await fs.readFile(path, "utf8"); // throws on missing file
  return JSON.parse(text);                       // throws on bad JSON
}
// caller must remember to try/catch around every await
```

**✅ Idiomatic**

```js
// Return Result at the boundary; convert throwing APIs into Ok/Err.
const Ok = (value) => ({ ok: true, value });
const Err = (error) => ({ ok: false, error });

async function loadConfig(path) {
  try {
    return Ok(JSON.parse(await fs.readFile(path, "utf8")));
  } catch (e) {
    return Err({ kind: e.code === "ENOENT" ? "missing" : "invalid", cause: e });
  }
}
// const cfg = await loadConfig(p); if (!cfg.ok) useDefaults(cfg.error); else start(cfg.value);
```

**🧠 Tradeoff** — Converting throwing I/O into a `Result` at the boundary makes the two real
outcomes (missing vs. invalid) explicit and keeps callers from silently missing a `try/catch`. The
cost is the wrapping at every boundary and interop with the rest of Node, which throws; you convert
at the edges. `neverthrow`/`Effect` formalize this for larger codebases.

### Python

**❌ Naive**

```python
# None-or-raise: the signature hides both possibilities.
def find_user(id):
    u = db.get(id)
    if u is None:
        return None            # absence as None
    if u.banned:
        raise ValueError("banned")  # failure as exception
    return u
```

**✅ Idiomatic**

```python
from dataclasses import dataclass
from typing import Generic, TypeVar, Union

T = TypeVar("T"); E = TypeVar("E")

@dataclass
class Ok(Generic[T]):   value: T
@dataclass
class Err(Generic[E]):  error: E

Result = Union[Ok[T], Err[E]]

def find_user(id) -> Result:
    u = db.get(id)
    if u is None:  return Err("not_found")
    if u.banned:   return Err("banned")
    return Ok(u)

# caller pattern-matches — both cases handled:
match find_user(id):
    case Ok(user):  render(user)
    case Err(reason): render_error(reason)
```

**🧠 Tradeoff** — Dataclasses plus `match` give Python real Ok/Err with exhaustive-ish pattern
matching, and libraries (`returns`, `result`) provide `map`/`bind` and typing. It reads cleanly, but
it swims against Python's exception-first culture, so it's most valuable at boundaries with expected
failures (parsing, validation) rather than everywhere. `Optional[T]` covers the simpler
presence/absence case idiomatically.

### Elixir

**❌ Naive**

```elixir
# Raising for expected failures fights the language's grain.
def find_user(id) do
  case db_get(id) do
    nil -> raise "not found"        # expected absence as an exception
    %{banned: true} -> raise "banned"
    user -> user
  end
end
```

**✅ Idiomatic**

```elixir
# The {:ok, value} | {:error, reason} tuple IS Result; `with` chains and short-circuits.
def find_user(id) do
  case db_get(id) do
    nil -> {:error, :not_found}
    %{banned: true} -> {:error, :banned}
    user -> {:ok, user}
  end
end

# compose fallible steps; the first {:error, _} short-circuits the whole chain:
with {:ok, user} <- find_user(id),
     {:ok, email} <- fetch_email(user),
     {:ok, _} <- send_welcome(email) do
  {:ok, :sent}
else
  {:error, reason} -> handle(reason)
end
```

**🧠 Tradeoff** — Elixir has this pattern in its bones: `{:ok, value}`/`{:error, reason}` tuples are
the universal convention, and `with` chains them, short-circuiting on the first `:error` — Result
without a library. Pattern matching makes it ergonomic and total. The nuance is the two conventions
in the ecosystem — tuple-returning `find/2` vs. raising `find!/2` — so you pick the fallible or the
bang variant per situation.

### Go

**❌ Naive**

```go
// A sentinel nil + a bool, or a panic — easy to use the zero value by mistake.
func FindUser(id string) *User {
    u := db.Get(id)
    if u == nil {
        return nil // caller may deref nil
    }
    if u.Banned {
        panic("banned") // failure as panic
    }
    return u
}
```

**✅ Idiomatic**

```go
// Go's (value, error) IS Result; (value, ok) IS Option. The compiler nudges you to check.
func FindUser(id string) (User, error) {
    u, ok := db.Get(id)
    if !ok {
        return User{}, ErrNotFound         // absence/failure as an error value
    }
    if u.Banned {
        return User{}, ErrBanned
    }
    return u, nil
}

// caller must take both return values; errors.Is lets it react to the reason:
u, err := FindUser(id)
if err != nil {
    return handle(err) // can't reach u without acknowledging err
}
```

**🧠 Tradeoff** — Go bakes Result into the language: the `(T, error)` pair is exactly Ok/Err, and
`(T, ok bool)` is Option — the compiler and `go vet` push you to handle the second value. Errors are
values you can wrap (`%w`) and inspect (`errors.Is/As`), giving the composability without a monad.
The trade is the famous `if err != nil` verbosity — explicit at every step rather than chained — but
the failure case is impossible to overlook.

## Applications

- **Parsing & validation** — return `Result` with a structured error instead of throwing on bad
  input (backend & frontend).
- **Lookups & queries** — `Option`/`(value, ok)` for "might not exist" instead of null (backend).
- **API clients** — model network/HTTP outcomes as `Result` so callers handle failure explicitly
  (backend & frontend).
- **Form handling** — accumulate validation results per field, combining `Err`s into a report
  (frontend).
- **Elixir/Go idioms** — `{:ok, _}`/`{:error, _}` and `(value, error)` are the everyday shape of the
  whole ecosystem (backend).

## Related Patterns

- **Function Composition** — `map`/`andThen` let Options/Results compose into pipelines that
  short-circuit on the first failure.
- **Immutability** — these are immutable value wrappers; transforming one produces a new one rather
  than mutating.
- **Retry** — a `Result`'s `Err` is what a retry policy inspects to decide whether a failure is
  transient and worth re-attempting.
