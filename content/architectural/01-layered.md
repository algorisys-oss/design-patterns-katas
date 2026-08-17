---
id: layered
category: architectural
sequence: 1
title: Layered Architecture
also_known_as: [N-Tier, Multilayer]
gof: false
intent: "Organize a system into horizontal layers where each layer depends only on the ones beneath it, so responsibilities and change are contained."
frequency: high
difficulty: beginner
tags: [architecture, separation-of-concerns, dependencies, structure]
related: [hexagonal, repository, dependency-inversion]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Split the system into stacked **layers** — typically presentation, application, domain, and
infrastructure — where each layer only calls **downward**. Presentation talks to application,
application to domain, and so on; nothing reaches back up.

The one-directional dependency rule is the whole idea. It gives every concern a home, keeps a
change in one layer from rippling into the others, and lets you reason about (and test) a layer
knowing only the contract of the layer below.

## The Problem

Without layers, responsibilities smear across the codebase. A single request handler parses HTTP,
runs business rules, builds SQL, and formats the response — all in one function:

- **No separation of concerns** — UI, rules, and persistence tangle, so you can't change the
  database without risking the business logic.
- **Untestable core** — the rules can't run without a web request and a live database bolted on.
- **Duplication** — the same validation and query logic gets copy-pasted into every handler.
- **Unclear dependencies** — anything calls anything, so a small change has an unknown blast
  radius.

## Structure

Key Components:

- **Presentation** — controllers, views, serializers; turns transport (HTTP, CLI) into calls.
- **Application** — use cases / services; orchestrates a request, owns no business rules itself.
- **Domain** — entities and business rules; the heart, ignorant of the outside world.
- **Infrastructure** — databases, HTTP clients, file systems; the concrete outside world.

```
┌──────────────────────────┐  Presentation   (controllers, views)
├──────────────────────────┤        │ depends on
│                          │  Application    (use cases)
├──────────────────────────┤        │
│                          │  Domain         (entities, rules)
├──────────────────────────┤        │
└──────────────────────────┘  Infrastructure (db, http, fs)
        dependencies point downward only
```

## When to Use

- A team needs a familiar, conventional structure everyone can navigate.
- Concerns (UI, rules, persistence) change at different rates and should be isolated.
- You want the business rules testable without a web server or database.
- The domain is moderately complex — enough to warrant separating rules from plumbing.

## Advantages and Disadvantages

### Advantages
- **Separation of concerns** — each layer has one job and one reason to change.
- **Testability** — lower layers mock cleanly; the domain runs with no infrastructure.
- **Familiarity** — nearly every developer already understands the shape.

### Disadvantages
- **Pass-through tax** — trivial features touch every layer, adding ceremony for little gain.
- **Leaky layering** — teams "cheat" by calling down two layers or leaking DB models upward,
  eroding the boundaries.
- **The dependency trap** — naive layering has the domain depend *on* infrastructure; clean
  designs invert that (see Related).

## Common Mistakes

- **Skipping layers** — a controller reaching straight into the database bypasses the rules and
  defeats the structure; always go through the layer below.
- **Leaking models** — returning ORM/database entities to the presentation layer couples the UI
  to the schema; map to DTOs at the boundary.
- **A domain that depends on infrastructure** — importing the database client into domain code
  makes the core untestable; invert it with an interface the infra layer implements.
- **An anemic pass-through** — layers that only forward calls add cost with no separation; collapse
  layers that don't earn their keep.

## Key Takeaways

- Layers give concerns a home; the downward-only dependency rule keeps change contained.
- The domain should be the most isolated, testable part — no HTTP, no SQL.
- Map at the boundaries (DTOs) so layers don't leak each other's models.
- When the domain must "use" infrastructure, invert the dependency with an interface.

## Implementations

### JavaScript

**❌ Naive**

```js
// One function does transport, rules, and persistence — nothing is separable.
async function handleSignup(req, res) {
  if (!req.body.email.includes("@")) return res.status(400).send("bad email");
  const db = await connect();
  const existing = await db.query("SELECT * FROM users WHERE email=?", [req.body.email]);
  if (existing.length) return res.status(409).send("taken");
  await db.query("INSERT INTO users(email) VALUES(?)", [req.body.email]);
  res.send("ok");
}
```

**✅ Idiomatic**

```js
// Presentation → application → domain → infrastructure, each its own module.
// domain/user.js — rules, no I/O
export function validateEmail(email) {
  if (!email.includes("@")) throw new DomainError("bad email");
}

// application/signup.js — orchestrates, depends on a repo interface
export function makeSignup(users) {
  return async (email) => {
    validateEmail(email);
    if (await users.findByEmail(email)) throw new DomainError("taken");
    return users.create({ email });
  };
}

// presentation/routes.js — transport only
router.post("/signup", async (req, res) => {
  try {
    await signup(req.body.email);
    res.send("ok");
  } catch (e) {
    res.status(e.status ?? 500).send(e.message);
  }
});
```

**🧠 Tradeoff** — Splitting one handler into presentation/application/domain modules costs extra
files and a repository indirection, but each piece is now testable alone: the domain runs with no
web or DB, the use case runs against a fake `users`. For a throwaway script it's over-structure;
for anything that lives, the isolation pays back the first time you swap the datastore.

### Node.js

**❌ Naive**

```js
// A single Express file wiring routes straight to raw SQL and response shaping.
app.get("/orders/:id", async (req, res) => {
  const rows = await pool.query("SELECT * FROM orders WHERE id=$1", [req.params.id]);
  res.json({ id: rows[0].id, total: rows[0].total_cents / 100 }); // formatting in the route
});
```

**✅ Idiomatic**

```js
// Folder-per-layer; the route calls a service, the service calls a repository.
// infrastructure/order-repo.js
export const orderRepo = {
  byId: (id) => pool.query("SELECT * FROM orders WHERE id=$1", [id]).then((r) => r.rows[0]),
};
// application/order-service.js
export const makeOrderService = (repo) => ({
  async get(id) {
    const row = await repo.byId(id);
    if (!row) throw new NotFound("order");
    return { id: row.id, total: row.total_cents / 100 }; // domain shape, not DB shape
  },
});
// presentation/orders.js
router.get("/orders/:id", (req, res, next) =>
  orderService.get(req.params.id).then((o) => res.json(o)).catch(next));
```

**🧠 Tradeoff** — The Express route shrinks to transport; the service owns orchestration and the
repo owns SQL, so you can unit-test the service with a stub repo and no HTTP. The price is Node's
usual wiring — modules, a bit of dependency passing — but it keeps a growing API from becoming a
pile of fat route handlers.

### Python

**❌ Naive**

```python
# Django/Flask view doing validation, ORM, and serialization inline.
def create_user(request):
    email = request.POST["email"]
    if "@" not in email:
        return HttpResponse("bad email", status=400)
    if User.objects.filter(email=email).exists():
        return HttpResponse("taken", status=409)
    User.objects.create(email=email)
    return HttpResponse("ok")
```

**✅ Idiomatic**

```python
# domain/user.py — pure rules
def validate_email(email: str) -> None:
    if "@" not in email:
        raise DomainError("bad email")

# application/signup.py — use case against a repo protocol
class Signup:
    def __init__(self, users: "UserRepository"):
        self.users = users

    def __call__(self, email: str) -> User:
        validate_email(email)
        if self.users.find_by_email(email):
            raise DomainError("taken")
        return self.users.create(email)

# presentation/views.py — transport only
def create_user(request):
    try:
        signup(request.POST["email"])
        return HttpResponse("ok")
    except DomainError as e:
        return HttpResponse(str(e), status=e.status)
```

**🧠 Tradeoff** — Pulling rules into a pure `domain` module and the use case into `application`
lets you test them with plain `pytest` and a fake repo — no test client, no database fixtures.
Python won't stop you from importing the ORM into the domain, so the discipline is on you; a
`Protocol` for the repository keeps the domain honestly decoupled.

### Elixir

**❌ Naive**

```elixir
# A Phoenix controller reaching straight into Repo and formatting inline.
def create(conn, %{"email" => email}) do
  if String.contains?(email, "@") and Repo.get_by(User, email: email) == nil do
    Repo.insert!(%User{email: email})
    text(conn, "ok")
  else
    conn |> put_status(400) |> text("bad")
  end
end
```

**✅ Idiomatic**

```elixir
# Phoenix's "contexts" ARE the application/domain layer between web and Repo.
defmodule Accounts do
  # application + domain: rules and orchestration, web-agnostic
  def sign_up(email) do
    with :ok <- validate_email(email),
         nil <- Repo.get_by(User, email: email) do
      Repo.insert(%User{email: email})
    else
      _ -> {:error, :taken}
    end
  end

  defp validate_email(email), do: if String.contains?(email, "@"), do: :ok, else: {:error, :bad_email}
end

defmodule MyAppWeb.UserController do
  def create(conn, %{"email" => email}) do          # presentation only
    case Accounts.sign_up(email) do
      {:ok, _user} -> text(conn, "ok")
      {:error, reason} -> conn |> put_status(422) |> text(to_string(reason))
    end
  end
end
```

**🧠 Tradeoff** — Phoenix bakes layering in: the web layer (controllers/views) is deliberately
thin, and **contexts** hold the application+domain logic that can be tested and reused without the
endpoint. You get the boundary as a framework convention rather than hand-rolled folders. The
subtlety is context design — too many tiny contexts, or a "God context," both erode the benefit.

### Go

**❌ Naive**

```go
// Handler does everything: decode, query, format.
func getOrder(w http.ResponseWriter, r *http.Request) {
    row := db.QueryRow("SELECT total_cents FROM orders WHERE id=$1", r.PathValue("id"))
    var cents int
    row.Scan(&cents)
    json.NewEncoder(w).Encode(map[string]float64{"total": float64(cents) / 100})
}
```

**✅ Idiomatic**

```go
// Package-per-layer; the domain defines the interface it needs, infra implements it.
// domain: the port lives with the code that uses it
type OrderRepo interface {
    ByID(id string) (Order, error)
}
type OrderService struct{ repo OrderRepo }

func (s OrderService) Get(id string) (Order, error) { // orchestration + rules
    o, err := s.repo.ByID(id)
    if err != nil {
        return Order{}, fmt.Errorf("get order: %w", err)
    }
    return o, nil
}

// presentation: handler depends on the service, not the DB
func (h Handler) getOrder(w http.ResponseWriter, r *http.Request) {
    o, err := h.svc.Get(r.PathValue("id"))
    if err != nil { http.Error(w, err.Error(), 404); return }
    json.NewEncoder(w).Encode(o)
}
```

**🧠 Tradeoff** — Go layers by package, and its small implicit interfaces make the clean version
natural: the domain declares the `OrderRepo` interface it needs, and the infrastructure package
implements it — so the dependency points *inward* even though infra sits at the bottom. Wiring is
explicit in `main` (no container), which is verbose but leaves the dependency graph obvious.

### CSharp

**❌ Naive**

```csharp
// The endpoint does everything: query, math, response shape.
app.MapGet("/orders/{id}", async (string id) =>
{
    var cents = await db.QuerySingleAsync<int>(
        "SELECT total_cents FROM orders WHERE id = @id", new { id });
    return Results.Json(new { total = cents / 100.0 }); // formatting in the route
});
```

**✅ Idiomatic**

```csharp
// Presentation — the endpoint depends on the service, not the database.
app.MapGet("/orders/{id}", async (string id, OrderService svc) =>
    Results.Json(await svc.GetAsync(id)));

// Infrastructure registers itself in the composition root:
// builder.Services.AddScoped<IOrderRepo, PostgresOrderRepo>();

// Domain — owns the contract and the rules; references no infrastructure.
public record Order(string Id, decimal Total);

public interface IOrderRepo
{
    Task<Order?> ByIdAsync(string id);
}

public sealed class OrderService(IOrderRepo repo)
{
    public async Task<Order> GetAsync(string id) =>
        await repo.ByIdAsync(id) ?? throw new OrderNotFoundException(id);
}
```

**🧠 Tradeoff** — In C# the layers are usually separate *projects*, and that makes the rule
mechanical: the domain project has no reference to the infrastructure project, so importing EF
into the domain won't compile. ASP.NET's built-in DI container is the composition root Go writes
by hand — less wiring code, but the dependency graph now lives in `AddScoped` calls rather than
in plain constructors, so it takes discipline to keep it readable.

### Rust

**❌ Naive**

```rust
// One function looks up, applies the rule, and formats — nothing is separable.
fn get_order(store: &std::collections::HashMap<String, i64>, id: &str) -> String {
    match store.get(id) {
        Some(cents) => format!("{{\"total\": {}}}", *cents as f64 / 100.0), // formatting inline
        None => "not found".to_string(),
    }
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;

// Module-per-layer; the domain owns the trait, infrastructure implements it.
// domain
struct Order { id: String, total: f64 }

trait OrderRepo {
    fn by_id(&self, id: &str) -> Option<Order>;
}

struct OrderService<R: OrderRepo> { repo: R }

impl<R: OrderRepo> OrderService<R> {
    fn get(&self, id: &str) -> Result<Order, String> {
        self.repo.by_id(id).ok_or_else(|| format!("order {id} not found"))
    }
}

// infrastructure — implements the domain's trait
struct InMemoryOrders(HashMap<String, i64>);

impl OrderRepo for InMemoryOrders {
    fn by_id(&self, id: &str) -> Option<Order> {
        self.0.get(id).map(|cents| Order { id: id.to_string(), total: *cents as f64 / 100.0 })
    }
}

fn main() {
    let repo = InMemoryOrders(HashMap::from([("o1".to_string(), 2500)]));
    let svc = OrderService { repo };
    println!("{}", svc.get("o1").unwrap().total); // 25
}
```

**🧠 Tradeoff** — Rust layers by module (or crate), and visibility does the policing: a domain
module that never writes `use crate::infrastructure` can't touch it, and `pub` marks exactly what
crosses each boundary. Ownership adds a quiet bonus — `by_id` returns an *owned* `Order`, so the
domain gets a DTO by construction, never a live reference into storage. The generic
`OrderService<R>` fixes the store at compile time; use `Box<dyn OrderRepo>` if the store must be
chosen at runtime.

### Zig

**❌ Naive**

```zig
const std = @import("std");

var store: std.StringHashMap(i64) = undefined;

// One function does lookup, rule, and formatting against a global map.
fn getOrder(id: []const u8) void {
    const cents = store.get(id) orelse {
        std.debug.print("not found\n", .{});
        return;
    };
    std.debug.print("{{\"total\": {d}}}\n", .{@as(f64, @floatFromInt(cents)) / 100.0});
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// domain — the service is generic over any repo type with a byId method.
fn OrderService(comptime Repo: type) type {
    return struct {
        repo: Repo,

        pub fn get(self: @This(), id: []const u8) !f64 {
            const cents = self.repo.byId(id) orelse return error.NotFound;
            return @as(f64, @floatFromInt(cents)) / 100.0;
        }
    };
}

// infrastructure — satisfies the shape just by having byId.
const InMemoryOrders = struct {
    cents: std.StringHashMap(i64),

    pub fn byId(self: InMemoryOrders, id: []const u8) ?i64 {
        return self.cents.get(id);
    }
};

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    var store = std.StringHashMap(i64).init(gpa.allocator());
    defer store.deinit();
    try store.put("o1", 2500);

    const svc = OrderService(InMemoryOrders){ .repo = .{ .cents = store } };
    std.debug.print("total: {d}\n", .{try svc.get("o1")}); // total: 25
}
```

**🧠 Tradeoff** — Zig has no interfaces, so the layer contract here is *structural*: the comptime
generic accepts any type with a `byId` method, checked only where `OrderService(InMemoryOrders)`
is instantiated. That's zero-cost layering, but there is no named contract to read — the "layer
below" is whatever methods the service happens to call, so a doc comment carries the contract.
Swapping the store at *runtime* needs the vtable idiom instead (see the hexagonal kata). Be
honest, too: small Zig programs usually layer by file and skip the generic entirely.

### Java

**❌ Naive**

```java
// The handler does everything: connect, query, format.
class OrderHandler {
    String getOrder(String id) throws SQLException {
        try (var conn = DriverManager.getConnection(DB_URL);
             var stmt = conn.prepareStatement("SELECT total_cents FROM orders WHERE id = ?")) {
            stmt.setString(1, id);
            var rs = stmt.executeQuery();
            if (!rs.next()) return "not found";
            return "{\"total\": %s}".formatted(rs.getInt(1) / 100.0); // formatting in the handler
        }
    }
}
```

**✅ Idiomatic**

```java
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;

// Package-per-layer; the domain owns the interface, infrastructure implements it.
// domain — contract and rules; imports nothing from the layers below
record Order(String id, double total) {}

interface OrderRepo {
    Optional<Order> byId(String id);
}

class OrderService {
    private final OrderRepo repo;
    OrderService(OrderRepo repo) { this.repo = repo; }

    Order get(String id) {                        // orchestration + rules
        return repo.byId(id).orElseThrow(() -> new NoSuchElementException("order " + id));
    }
}

// infrastructure — implements the domain's interface
class InMemoryOrders implements OrderRepo {
    private final Map<String, Integer> cents = Map.of("o1", 2500);

    public Optional<Order> byId(String id) {
        return Optional.ofNullable(cents.get(id)).map(c -> new Order(id, c / 100.0));
    }
}

// presentation — depends on the service, not the store
public class Demo {
    public static void main(String[] args) {
        var svc = new OrderService(new InMemoryOrders());
        System.out.println(svc.get("o1").total()); // 25.0
    }
}
```

**🧠 Tradeoff** — Java layers by package, and one build module (Maven/Gradle) per layer makes the
rule mechanical the way C# projects do: the domain module lists no infrastructure dependency, so
importing the JDBC driver into `OrderService` won't compile. JPMS can tighten that further — a
`module-info.java` that exports only the domain's interfaces states the architecture in code —
though most teams stop at build modules. This is Spring's home turf: `@Controller`, `@Service`,
and `@Repository` are the three layers as stereotype annotations, with the container doing the
constructor wiring `Demo` does by hand. The pattern doesn't need the framework — a constructor
taking an interface is the whole trick — the framework just made it the default shape of Java.

## Applications

- **Web applications** — the near-universal controller → service → repository → database split
  (backend).
- **Enterprise systems** — classic N-tier (presentation / business / data) deployments, sometimes
  as separate physical tiers (backend).
- **Mobile & desktop apps** — UI / view-model / domain / data layers keep platform code out of the
  business logic (frontend).
- **Framework conventions** — Rails, Django, Spring, and Phoenix all encode a layered default so
  teams share one structure (backend).
- **APIs** — request handlers stay thin over a reusable service/domain core shared across REST,
  GraphQL, and gRPC surfaces (backend).

## Related Patterns

- **Hexagonal (Ports & Adapters)** — layering's evolution: instead of a straight downward stack,
  the domain is centered and infrastructure plugs in through interfaces it *owns*.
- **Repository** — the standard seam between the application/domain layers and the data layer.
- **Dependency Inversion** — the principle that keeps the domain from depending on infrastructure,
  turning a leaky stack into clean layers.
