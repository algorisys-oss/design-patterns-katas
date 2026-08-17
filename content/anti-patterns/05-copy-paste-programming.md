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
languages: [javascript, python, go, csharp, rust, zig, java]
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

### CSharp

**❌ The Smell**

```csharp
// The same retry loop pasted around every HTTP call, each drifting slightly.
using var http = new HttpClient();

async Task<string> GetUser(int id)
{
    for (var i = 0; ; i++)
    {
        try { return await http.GetStringAsync($"/api/users/{id}"); }
        catch (HttpRequestException) when (i < 2) { await Task.Delay(200 * (1 << i)); }
    }
}

async Task<string> GetOrder(int id)
{
    for (var i = 0; ; i++)                            // copy of the above
    {
        try { return await http.GetStringAsync($"/api/orders/{id}"); }
        catch (HttpRequestException) when (i < 2) { } // this copy forgot the backoff
    }
}
```

**✅ The Refactor**

```csharp
// Extract the retry once; the varying part — the call itself — is a Func<Task<T>>.
using var http = new HttpClient();

async Task<T> WithRetry<T>(Func<Task<T>> action, int attempts = 3)
{
    for (var i = 0; ; i++)
    {
        try { return await action(); }
        catch (HttpRequestException) when (i < attempts - 1)
        {
            await Task.Delay(200 * (1 << i));
        }
    }
}

Task<string> GetUser(int id) => WithRetry(() => http.GetStringAsync($"/api/users/{id}"));
Task<string> GetOrder(int id) => WithRetry(() => http.GetStringAsync($"/api/orders/{id}"));
// fix a retry bug once → every caller benefits.
```

**🧠 The Fix** — The try-catch-delay ceremony was pure duplication; `WithRetry<T>` holds it
once and takes the varying behavior as a `Func<Task<T>>`, so the "forgot the backoff" drift
can't recur and a policy change (attempts, delay curve) lands everywhere at once. In
production you'd likely hand this job to a resilience library like Polly — but the move is
the same: one home for the retry knowledge, the difference passed in as a delegate.

### Rust

**❌ The Smell**

```rust
// The same trim-parse-validate block pasted into every config reader.
fn parse_port(raw: &str) -> Result<u16, String> {
    let n: u16 = raw.trim().parse().map_err(|_| format!("bad port: {raw}"))?;
    if n == 0 {
        return Err("port must be nonzero".into());
    }
    Ok(n)
}

fn parse_timeout(raw: &str) -> Result<u16, String> {
    let n: u16 = raw.trim().parse().map_err(|_| format!("bad timeout: {raw}"))?; // copy
    Ok(n) // this copy forgot the zero check
}
```

**✅ The Refactor**

```rust
// One parser; the varying bits — the field name and the extra rule — are parameters.
fn parse_field(name: &str, raw: &str, check: impl Fn(u16) -> Result<(), String>) -> Result<u16, String> {
    let n: u16 = raw.trim().parse().map_err(|_| format!("bad {name}: {raw}"))?;
    check(n)?;
    Ok(n)
}

fn parse_port(raw: &str) -> Result<u16, String> {
    parse_field("port", raw, |n| {
        if n == 0 { Err("port must be nonzero".into()) } else { Ok(()) }
    })
}

fn parse_timeout(raw: &str) -> Result<u16, String> {
    parse_field("timeout", raw, |_| Ok(())) // no extra rule — stated, not forgotten
}
```

**🧠 The Fix** — The copies differed in two ways, and the extraction names both: the field
name became a value parameter, the extra rule became a closure via `impl Fn`. Each call site
now *states* its rule — `parse_timeout` visibly accepts anything instead of silently
forgetting a check it was supposed to copy. The generic bound monomorphizes, so the
abstraction costs nothing at runtime; the dedup lives in the source, where the maintenance
burden is.

### Zig

*Targets Zig 0.17-dev.*

**❌ The Smell**

```zig
const std = @import("std");

// The same trim-parse-validate block pasted into every config reader.
fn parsePort(raw: []const u8) !u16 {
    const trimmed = std.mem.trim(u8, raw, " \t\r\n");
    const n = try std.fmt.parseInt(u16, trimmed, 10);
    if (n == 0) return error.ZeroValue;
    return n;
}

fn parseTimeout(raw: []const u8) !u16 {
    const trimmed = std.mem.trim(u8, raw, " \t\r\n"); // copy
    return try std.fmt.parseInt(u16, trimmed, 10);    // this copy forgot the zero check
}
```

**✅ The Refactor**

```zig
const std = @import("std");

// One parser; the varying rule rides along as a plain function (Zig has no closures).
fn parseField(raw: []const u8, check: *const fn (u16) anyerror!void) !u16 {
    const trimmed = std.mem.trim(u8, raw, " \t\r\n");
    const n = try std.fmt.parseInt(u16, trimmed, 10);
    try check(n);
    return n;
}

fn nonzero(n: u16) anyerror!void {
    if (n == 0) return error.ZeroValue;
}

fn anyValue(_: u16) anyerror!void {}

fn parsePort(raw: []const u8) !u16 {
    return parseField(raw, nonzero);
}

fn parseTimeout(raw: []const u8) !u16 {
    return parseField(raw, anyValue); // no extra rule — stated, not forgotten
}
```

**🧠 The Fix** — The trim-parse ceremony lives once, and the varying rule is a plain
`*const fn` pointer — Zig has no closures, so the rule can't capture context, which this
one doesn't need. (A rule that did would take the `*anyopaque` context + function pointer
shape, or a comptime parameter.) The refactor is also honest about the drift:
`parseTimeout` now declares it accepts anything, instead of quietly missing a check its
sibling had. Extraction in Zig costs a little more ceremony than a closure would — worth it
the moment two copies start to disagree.

### Java

**❌ The Smell**

```java
// The same retry loop pasted around every HTTP call, each drifting slightly.
class Api {
    private final HttpClient http = HttpClient.newHttpClient();

    String getUser(int id) throws Exception {
        for (int i = 0; ; i++) {
            try { return fetch("/api/users/" + id); }
            catch (IOException e) {
                if (i == 2) throw e;
                Thread.sleep(200L * (1 << i));
            }
        }
    }

    String getOrder(int id) throws Exception {
        for (int i = 0; ; i++) {                  // copy of the above
            try { return fetch("/api/orders/" + id); }
            catch (IOException e) {
                if (i == 2) throw e;              // this copy forgot the backoff
            }
        }
    }

    private String fetch(String path) throws Exception {
        var req = HttpRequest.newBuilder(URI.create("https://api.example.com" + path)).build();
        return http.send(req, HttpResponse.BodyHandlers.ofString()).body();
    }
}
```

**✅ The Refactor**

```java
// Extract the retry once; the varying call rides in as a Callable<T>.
class Api {
    private final HttpClient http = HttpClient.newHttpClient();

    static <T> T withRetry(Callable<T> action, int attempts) throws Exception {
        for (int i = 0; ; i++) {
            try { return action.call(); }
            catch (IOException e) {
                if (i == attempts - 1) throw e;
                Thread.sleep(200L * (1 << i));
            }
        }
    }

    String getUser(int id) throws Exception {
        return withRetry(() -> fetch("/api/users/" + id), 3);
    }

    String getOrder(int id) throws Exception {
        return withRetry(() -> fetch("/api/orders/" + id), 3);
    }

    private String fetch(String path) throws Exception { /* as before */ }
}
// fix a retry bug once → every caller benefits.
```

**🧠 The Fix** — The try-catch-sleep ceremony lives once in `withRetry`, and the varying behavior arrives
as a `Callable<T>` — chosen over `Supplier<T>` deliberately, because `call()` declares `throws Exception`
and Java's other functional interfaces don't, which is the wrinkle that usually pushes people back to
pasting. Now the "forgot the backoff" drift can't recur, and a policy change (attempts, delay curve) lands
everywhere at once. In production this job often goes to a library like Resilience4j — but the move is the
same: one home for the retry knowledge, the difference passed in as a lambda.

## Related Patterns

- **Function Composition** — extracting duplicated logic into small, composable functions is the everyday cure
  for copy-paste.
- **Template Method** — when copies share a *skeleton* but differ in steps, a template method holds the common
  structure and lets the varying steps differ — DRY for algorithms.
- **Strategy** — when the difference between copies is *behavior*, extract the common code and pass the varying
  behavior as a strategy/callback instead of duplicating the whole block.
