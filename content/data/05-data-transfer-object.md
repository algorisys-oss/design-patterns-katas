---
id: data-transfer-object
category: data
sequence: 5
title: Data Transfer Object
also_known_as: [DTO, Transfer Object, Value Object (in transit)]
gof: false
intent: "Carry data across a boundary — process, network, or layer — in a simple, behavior-free object shaped for the transfer, decoupling the wire/API shape from your internal domain model."
frequency: high
difficulty: beginner
tags: [data, boundaries, api, decoupling, serialization]
related: [data-mapper, container-presentational, layered]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Define a **plain, behavior-free object** whose only job is to hold the exact set of fields needed to cross
a boundary — an API response, a message payload, a call between layers or services. The DTO's shape is
designed for the *consumer* and the *transfer*, not for your internal domain.

This decouples two things that shouldn't be welded together: how you model data internally and how you
expose it. Your domain can be rich and change freely; the DTO presents a stable, minimal, tailored view.
It also bundles what a consumer needs into one payload, avoiding many fine-grained round-trips.

## The Problem

Exposing domain/database objects directly across boundaries couples the outside world to your internals:

- **Leaking internals** — serializing a domain entity (or ORM row) exposes internal fields, computed
  properties, and structure the consumer shouldn't depend on — and can leak sensitive data (password
  hashes, internal ids).
- **Coupling the API to the schema** — clients now depend on your table/object shape, so a refactor breaks
  them.
- **Over/under-fetching** — the domain object has too much (waste, security) or the wrong shape (client
  must stitch several).
- **Chatty interfaces** — without a bundled DTO, a client makes many calls to assemble what it needs.

## Structure

Key Components:

- **DTO** — a plain data holder (fields only, no behavior) shaped for a specific transfer/consumer.
- **Assembler / Mapper** — builds the DTO from domain objects (and parses incoming DTOs back to domain).
- **Boundary** — the process/network/layer edge the DTO crosses.
- **Serialization** — the DTO is designed to serialize cleanly (JSON, protobuf, etc.).

```
Service ──assembles──► UserDTO { id, name, email }   (no behavior, tailored fields)
                            │  serialized across the boundary
                            ▼
                     Client / API   (depends on the DTO shape, not your domain)
```

## When to Use

- Data crosses a boundary: API responses/requests, message payloads, service-to-service calls, layer edges.
- The external shape should differ from (and be more stable than) your internal model.
- You must control exactly which fields are exposed (security, versioning).
- You want to bundle a consumer's needs into one payload to reduce round-trips.

## Advantages and Disadvantages

### Advantages
- **Decoupling** — the wire/API shape is independent of the domain model; each evolves separately.
- **Controlled exposure** — you choose exactly which fields cross, protecting internals and secrets.
- **Tailored & efficient** — the payload matches the consumer's needs, reducing over-fetch and round-trips.

### Disadvantages
- **Boilerplate** — extra classes and mapping code between domain and DTO in both directions.
- **Duplication** — DTOs often mirror domain fields, and both change together, feeling redundant.
- **Mapping drift** — the assembler can fall out of sync with the domain if not maintained.

## Common Mistakes

- **Putting behavior on the DTO** — a DTO with logic stops being a transfer object and recouples the
  boundary to behavior; keep it fields-only.
- **Exposing the domain object as the DTO** — "just serialize the entity" leaks internals and couples
  clients to the schema; assemble a dedicated DTO.
- **One DTO for every use** — reusing a fat DTO across read, write, and list endpoints exposes wrong fields
  each time; shape DTOs per use case (request vs. response, summary vs. detail).
- **Skipping validation on inbound DTOs** — trusting incoming DTOs without validating/parsing them into
  the domain lets bad data in (mass-assignment risks).

## Key Takeaways

- A DTO is a plain, behavior-free object shaped for crossing a boundary, distinct from the domain model.
- It decouples your API/wire shape from internals and controls exactly what's exposed.
- Assemble DTOs from domain objects (and validate inbound ones into the domain) — keep them fields-only.
- Shape DTOs per use case; don't leak the domain entity or reuse one fat DTO everywhere.

## Implementations

### JavaScript

**❌ Naive**

```js
// Serialize the domain/ORM object directly — leaks internals and couples the client to the schema.
app.get("/users/:id", async (req, res) => {
  const user = await User.find(req.params.id);
  res.json(user); // exposes passwordHash, internalFlags, DB column names...
});
```

**✅ Idiomatic**

```js
// A tailored DTO exposes exactly what the client needs, nothing more.
const toUserDTO = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  memberSince: user.createdAt.getFullYear(), // shaped for the consumer
  // no passwordHash, no internal flags
});

app.get("/users/:id", async (req, res) => {
  const user = await User.find(req.params.id);
  res.json(toUserDTO(user));
});
```

**🧠 Tradeoff** — A `toUserDTO` assembler gives you a stable, minimal, safe payload — the client depends on
the DTO shape, not your `User` internals, and secrets can't leak. The cost is the mapping function and the
feeling of duplication when DTO fields mirror domain fields. That "duplication" is the point: the two shapes
are allowed to diverge, and the DTO shields the API from domain refactors.

### Node.js

**❌ Naive**

```js
// Returning the raw DB row couples the API to the table and exposes everything.
const { rows } = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
res.json(rows[0]); // total_cents, internal_notes, deleted_at all leak
```

**✅ Idiomatic**

```js
// Assemble a response DTO; validate a request DTO on the way in.
function toUserResponse(row) {
  return { id: row.id, name: row.name, email: row.email }; // response DTO
}
// inbound: parse/validate into a typed request DTO before touching the domain
function parseCreateUser(body) {
  if (!body.email?.includes("@")) throw new BadRequest("email");
  return { name: String(body.name), email: String(body.email) }; // trusted shape
}
app.post("/users", async (req, res) => {
  const dto = parseCreateUser(req.body);         // validated inbound DTO
  const user = await createUser(dto);
  res.status(201).json(toUserResponse(user));    // tailored outbound DTO
});
```

**🧠 Tradeoff** — Separate request and response DTOs (with validation on the inbound side) keep the API
contract explicit and safe: `parseCreateUser` prevents mass-assignment and bad data, `toUserResponse`
controls exposure. Libraries (zod, class-transformer, DTO decorators in NestJS) formalize this. The extra
shapes are boilerplate; they're also your API's stable contract and a security boundary.

### Python

**❌ Naive**

```python
# Serializing the ORM model directly leaks fields and couples clients to the schema.
def get_user(request, id):
    user = User.objects.get(id=id)
    return JsonResponse(model_to_dict(user))  # exposes everything, including internals
```

**✅ Idiomatic**

```python
from dataclasses import dataclass, asdict

@dataclass(frozen=True)
class UserDTO:                       # plain, behavior-free, tailored
    id: int
    name: str
    email: str

def to_user_dto(user) -> UserDTO:
    return UserDTO(id=user.id, name=user.name, email=user.email)  # assembler

def get_user(request, id):
    return JsonResponse(asdict(to_user_dto(User.objects.get(id=id))))

# Pydantic/DRF serializers are the mature route (validation + serialization in one).
```

**🧠 Tradeoff** — A frozen dataclass DTO plus an assembler gives Python a clean, typed boundary object, and
Pydantic models / DRF serializers are the batteries-included version that also validate inbound data. It's
the standard way to keep API schemas independent of Django/ORM models. The mapping is boilerplate, but it's
what lets the API surface stay stable while the domain evolves — and keeps internal fields off the wire.

### Elixir

**❌ Naive**

```elixir
# Encoding the Ecto schema struct directly leaks fields and couples the API to it.
def show(conn, %{"id" => id}) do
  json(conn, Repo.get(User, id))   # renders every schema field, including internal ones
end
```

**✅ Idiomatic**

```elixir
# A view/DTO shapes exactly the transfer payload (Phoenix views are DTO assemblers).
defmodule MyAppWeb.UserJSON do
  def show(%{user: user}), do: %{data: data(user)}

  # the DTO shape — plain map, tailored fields, no internals
  defp data(user) do
    %{id: user.id, name: user.name, email: user.email, member_since: user.inserted_at.year}
  end
end

def show(conn, %{"id" => id}) do
  user = Accounts.get_user!(id)
  render(conn, :show, user: user)   # UserJSON.data builds the DTO
end
```

**🧠 Tradeoff** — Phoenix's JSON views are DTO assemblers: the `data/1` function defines exactly the payload
shape as a plain map, decoupled from the Ecto schema, so internals never render and the API contract is
explicit. It fits the functional style — data-shaping functions, no behavior on the payload. The cost is
writing the view/DTO per representation; the gain is API stability independent of your schemas and no
accidental field leaks.

### Go

**❌ Naive**

```go
// Marshaling the domain/DB struct directly exposes internal fields via json tags.
type User struct {
    ID           int    `json:"id"`
    Name         string `json:"name"`
    PasswordHash string `json:"passwordHash"` // leaks!
}
json.NewEncoder(w).Encode(user)
```

**✅ Idiomatic**

```go
// A dedicated response DTO controls exactly what's serialized.
type UserResponse struct {
    ID    int    `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}

func toUserResponse(u User) UserResponse {
    return UserResponse{ID: u.ID, Name: u.Name, Email: u.Email} // assembler, no internals
}

// inbound request DTO, validated before mapping to the domain:
type CreateUserRequest struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}
json.NewEncoder(w).Encode(toUserResponse(user))
```

**🧠 Tradeoff** — Separate `UserResponse`/`CreateUserRequest` structs are idiomatic Go for API boundaries:
the domain struct stays internal, and dedicated DTOs control JSON exposure field-by-field (no accidental
`PasswordHash` leak). It's explicit and type-safe, matching Go's preference for visible boundaries over
reflection tricks on one shared struct. The extra structs and mapping are the cost; the clean, stable API
contract is the payoff.

## Applications

- **REST/GraphQL APIs** — request/response DTOs (serializers, schemas) shape the contract independent of the
  domain (backend).
- **Service-to-service calls** — message/RPC payloads (protobuf, Avro) are DTOs crossing service boundaries
  (backend).
- **Layer boundaries** — passing view models to the presentation layer instead of domain entities (backend
  & frontend).
- **Frontend view models** — mapping API responses into UI-shaped objects the components consume (frontend).
- **Aggregated payloads** — a Backend-for-Frontend assembling one DTO from several services to reduce
  round-trips (backend).

## Related Patterns

- **Data Mapper** — both translate between shapes; the mapper maps domain↔database, the DTO maps
  domain↔boundary/wire.
- **Container / Presentational** — a frontend DTO/view model is what a container hands its presentational
  components — data shaped for display.
- **Layered / Hexagonal** — DTOs are what cross the layer/adapter boundaries, keeping the domain model from
  leaking outward.
