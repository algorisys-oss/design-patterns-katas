---
id: copy-paste-programming
category: anti-patterns
kind: anti-pattern
sequence: 5
title: Copy-Paste Programming
also_known_as: [Duplicated Code, WET Code, Cut-and-Paste]
gof: false
intent: "Solving a repeated need by copying an existing block of code and tweaking it, instead of extracting a shared abstraction — scattering duplicates that must all be found and fixed together, but never are."
frequency: high
difficulty: beginner
tags: [anti-pattern, duplication, dry, maintainability, refactoring]
related: [function-composition, template-method, strategy]
languages: [javascript, python, go]
---

## The Anti-Pattern

**Copy-Paste Programming** solves "I need something like that" by duplicating an existing block and modifying
the copy. The same logic ends up in five, ten, twenty places, each slightly different. It's the violation of
**DRY** (Don't Repeat Yourself): knowledge that should live in one place is smeared across the codebase.

It feels productive — the copy works immediately — but every duplicate is a liability. A bug fixed in one
copy still lurks in the others; a rule change must be made everywhere it was pasted, and the one place you
miss is where the next incident comes from. Over time the copies drift apart, so you can't even tell which
version is "right."

## How It Happens

- **It's faster right now** — copying a working block and tweaking it is quicker than designing a reusable
  abstraction, so under pressure it wins.
- **Fear of coupling** — extracting shared code feels like it couples the callers, so people duplicate to
  "keep them independent" (often overcorrecting).
- **Not noticing the duplication** — the original is in a different file/module, so the author doesn't
  realize they're re-implementing it.
- **Copying from Stack Overflow / another project** — pasting an external snippet repeatedly without
  consolidating.

## Why It Hurts

- **Bugs multiply** — a defect in the copied block exists in every copy; fixing one leaves the rest broken.
- **Changes must be made N times** — a rule or format change requires finding and editing every duplicate,
  and the missed one is the bug.
- **Drift** — copies get edited independently until no two are the same, so "the logic" no longer exists in
  one authoritative place.
- **Bloat** — the codebase is larger than it needs to be, so there's more to read, test, and maintain.
- **Inconsistency** — the same operation behaves subtly differently in different places, confusing users and
  developers.

## The Refactor

Consolidate duplication into one shared abstraction:

- **Spot the duplication** — the same (or near-same) block appearing more than a couple of times is the
  signal; tools (linters, `jscpd`, IDE "find duplicates") help.
- **Extract the common part** — pull the shared logic into a function/method/module with a clear name.
- **Parameterize the differences** — the bits that varied between copies become parameters (or, for varying
  *behavior*, a strategy/callback or a template method).
- **Replace the copies** — call the shared abstraction from every former duplicate site.
- **But mind false duplication** — code that merely *looks* similar today but represents different concepts
  may be better left separate; don't couple unrelated things just because they resemble each other.

```
Original Block ──copied──► Copy 1 (drifted) · Copy 2 (bug fixed only here) · Copy 3
   ──refactor──► one shared function; the differences become parameters
```

## Warning Signs

- The same block of code appears in several files with minor edits.
- A bug fix has to be applied "in a few places"; someone always misses one.
- "I found three versions of this function and they don't match."
- Copy-paste-then-tweak is the team's default way to add similar features.
- Duplicate-detection tools light up.

## Key Takeaways

- Copying-and-tweaking scatters the same knowledge across the codebase (violates DRY).
- Every duplicate is a liability: bugs multiply, changes must be repeated, and copies drift apart.
- Extract the shared logic into one abstraction and parameterize the differences (values → params, behavior →
  strategy/template).
- But don't over-DRY: only consolidate true duplication of the *same* concept, not incidental resemblance.

## Implementations

### JavaScript

**❌ The Smell**

```js
// The same fetch-with-retry logic pasted into every API call, each drifting slightly.
async function getUser(id) {
  for (let i = 0; i < 3; i++) {
    try { return await (await fetch(`/api/users/${id}`)).json(); }
    catch (e) { if (i === 2) throw e; await sleep(200 * 2 ** i); }
  }
}
async function getOrder(id) {
  for (let i = 0; i < 3; i++) {                     // copy of the above
    try { return await (await fetch(`/api/orders/${id}`)).json(); }
    catch (e) { if (i === 2) throw e; await sleep(200 * 2 ** i); } // one copy forgot the backoff...
  }
}
```

**✅ The Refactor**

```js
// Extract the shared logic once; the varying part (the URL) is a parameter.
async function fetchJsonWithRetry(url, { attempts = 3 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try { return await (await fetch(url)).json(); }
    catch (e) { if (i === attempts - 1) throw e; await sleep(200 * 2 ** i); }
  }
}
const getUser = (id) => fetchJsonWithRetry(`/api/users/${id}`);
const getOrder = (id) => fetchJsonWithRetry(`/api/orders/${id}`);
// fix a retry bug once → every caller benefits.
```

**🧠 The Fix** — Extracting `fetchJsonWithRetry` collapses the pasted retry loops into one place, so a fix or
tweak (backoff, attempt count) happens once and every caller gets it — and the "one copy forgot the backoff"
class of bug disappears. The varying part (the URL) is a parameter. This is DRY: one home for the retry
knowledge.

### Python

**❌ The Smell**

```python
# The same validation + normalization pasted into every endpoint.
def create_user(data):
    email = data.get("email", "").strip().lower()
    if "@" not in email: raise ValueError("bad email")
    # ...
def update_user(data):
    email = data.get("email", "").strip().lower()   # copy
    if "@" not in email: raise ValueError("bad email")  # copy — and update_user's copy allows "" now
    # ...
```

**✅ The Refactor**

```python
# One normalizer/validator, reused everywhere.
def clean_email(data):
    email = data.get("email", "").strip().lower()
    if "@" not in email:
        raise ValueError("bad email")
    return email

def create_user(data): email = clean_email(data); ...
def update_user(data): email = clean_email(data); ...
# the email rule lives in ONE place; change it once, consistently.
```

**🧠 The Fix** — Pulling the email normalize-and-validate into `clean_email` means the rule exists once, so it
can't drift between endpoints (the subtle "update allows empty" bug can't happen) and a change applies
everywhere. The difference between the sites (there wasn't one — pure duplication) makes this a clean
extraction. Python's functions make the shared abstraction cheap.

### Go

**❌ The Smell**

```go
// Duplicated transaction boilerplate around every DB operation.
func createUser(db *sql.DB, u User) error {
    tx, err := db.Begin(); if err != nil { return err }
    if _, err := tx.Exec("INSERT INTO users ..."); err != nil { tx.Rollback(); return err }
    return tx.Commit()
}
func createOrder(db *sql.DB, o Order) error {
    tx, err := db.Begin(); if err != nil { return err }        // copy of the ceremony
    if _, err := tx.Exec("INSERT INTO orders ..."); err != nil { tx.Rollback(); return err }
    return tx.Commit()
}
```

**✅ The Refactor**

```go
// Extract the transaction boilerplate; the varying part is a callback (behavior parameter).
func withTx(db *sql.DB, fn func(*sql.Tx) error) error {
    tx, err := db.Begin()
    if err != nil { return err }
    if err := fn(tx); err != nil { tx.Rollback(); return err }
    return tx.Commit()
}
func createUser(db *sql.DB, u User) error {
    return withTx(db, func(tx *sql.Tx) error { _, err := tx.Exec("INSERT INTO users ..."); return err })
}
func createOrder(db *sql.DB, o Order) error {
    return withTx(db, func(tx *sql.Tx) error { _, err := tx.Exec("INSERT INTO orders ..."); return err })
}
```

**🧠 The Fix** — The begin/rollback/commit ceremony was pure duplication; `withTx` extracts it once and takes
the *varying behavior* (what to run in the transaction) as a callback — a function parameter carrying the
difference. Now a fix to the transaction handling (say, adding a `defer` for panics) happens in one place.
Go's first-class functions make this "extract the boilerplate, pass the difference" refactor idiomatic.

## Related Patterns

- **Function Composition** — extracting duplicated logic into small, composable functions is the everyday cure
  for copy-paste.
- **Template Method** — when copies share a *skeleton* but differ in steps, a template method holds the common
  structure and lets the varying steps differ — DRY for algorithms.
- **Strategy** — when the difference between copies is *behavior*, extract the common code and pass the varying
  behavior as a strategy/callback instead of duplicating the whole block.
