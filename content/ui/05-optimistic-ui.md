---
id: optimistic-ui
category: ui
sequence: 5
title: Optimistic UI
also_known_as: [Optimistic Update, Optimistic Concurrency (UI)]
gof: false
intent: "Update the interface immediately as if a server action already succeeded, then reconcile with the real response — rolling back if it actually failed."
frequency: high
difficulty: intermediate
tags: [ui, latency, perceived-performance, rollback, reconciliation]
related: [saga, unidirectional-data-flow, reactive-state]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

When the user does something that requires a server round-trip — like a message, a like, a
rename — update the UI **right away**, as though it already worked, and send the request in the
background. When the server responds, confirm the change (usually a no-op since the UI already shows
it) or, if it failed, **roll back** to the previous state and tell the user.

Most actions succeed, and the network is slow relative to human perception. Assuming success makes
the app feel instant instead of making the user wait for a spinner on every tap — at the cost of
having to correctly undo the rare failure.

## The Problem

The safe approach — wait for the server before showing anything — feels sluggish:

- **Perceived latency** — every action shows a spinner and freezes until the round-trip completes,
  even though it will almost certainly succeed.
- **Interaction stalls** — the user can't keep going (send the next message, like the next post)
  until each request resolves.
- **Wasted confidence** — you already know what the result will be 99% of the time, yet you make the
  user wait for confirmation you don't need.
- **Janky UX** — rapid actions queue behind spinners, making a fast interface feel slow.

## Structure

Key Components:

- **Optimistic update** — apply the expected result to local UI state immediately.
- **Pending state** — mark the change as unconfirmed (so you can roll it back and optionally show it
  as "sending").
- **Server request** — sent in the background; its response is the source of truth.
- **Reconciliation** — on success, confirm/replace the optimistic value with the server's; on
  failure, roll back to the snapshot and surface the error.

```
user acts ──► apply optimistically (pending) ──► send to server
                                                    │
                          ┌── success ──► confirm / replace with server value
                          └── failure ──► roll back to snapshot + show error
```

## When to Use

- Actions almost always succeed and their result is predictable (likes, toggles, adds, renames).
- Network latency makes waiting feel slow relative to the action's importance.
- You can compute the expected outcome locally and roll it back cleanly.
- The occasional rollback is acceptable and can be communicated to the user.

## Advantages and Disadvantages

### Advantages
- **Instant feel** — the UI responds immediately; no per-action spinner.
- **Fluid interaction** — users keep acting without waiting on each round-trip.
- **Better perceived performance** — the app feels fast even on slow networks.

### Disadvantages
- **Rollback complexity** — you must snapshot and correctly undo state on failure, including derived
  values and ordering.
- **Temporary inconsistency** — the UI briefly shows a state the server hasn't confirmed; wrong if it
  fails.
- **Confusing on failure** — a change that appears then disappears can disorient users if not
  explained.

## Common Mistakes

- **No snapshot to roll back to** — applying the change without capturing the previous state leaves
  you unable to undo it on failure.
- **Optimism for risky actions** — using it for operations that often fail or have serious
  consequences (payments) surprises users with disappearing results; reserve it for
  high-success-rate actions.
- **Ignoring the server's response** — not reconciling with the real result lets client and server
  drift (e.g., the server assigned a different id).
- **Silent rollback** — undoing a change with no message makes the UI feel buggy; tell the user it
  failed and why.

## Key Takeaways

- Apply the expected result immediately, send in the background, reconcile with the response.
- Snapshot the previous state so you can roll back cleanly on failure.
- Use it for high-success, low-stakes actions; avoid it where failure is common or costly.
- Always surface a rollback to the user — a silently vanishing change reads as a bug.

## Implementations

### JavaScript

**❌ Naive**

```js
// Wait for the server before showing anything — a spinner on every like.
async function like(postId) {
  showSpinner(postId);
  await fetch(`/api/posts/${postId}/like`, { method: "POST" });
  incrementLikeUI(postId); // only after the round-trip
  hideSpinner(postId);
}
```

**✅ Idiomatic**

```js
// Update now, snapshot for rollback, reconcile with the response.
async function like(postId) {
  const snapshot = getLikes(postId);       // capture previous state
  setLikes(postId, snapshot + 1);          // optimistic: show it immediately
  try {
    const res = await fetch(`/api/posts/${postId}/like`, { method: "POST" });
    if (!res.ok) throw new Error("failed");
    setLikes(postId, (await res.json()).likes); // reconcile with server truth
  } catch {
    setLikes(postId, snapshot);            // roll back
    toast("Couldn't like — try again");    // tell the user
  }
}
```

**🧠 Tradeoff** — Snapshot → apply → reconcile/rollback is the whole pattern, and it makes the like
feel instant. Libraries formalize it: React Query's `onMutate`/`onError`/`onSettled` and React's
`useOptimistic` hook capture the snapshot and rollback for you. The complexity you own is correct
reconciliation — if the server returns a canonical value (id, count), replace the optimistic guess
with it.

### Node.js

**❌ Naive**

```js
// A collaborative endpoint that only broadcasts after the DB write — laggy for everyone.
socket.on("message", async (msg) => {
  await db.insertMessage(msg);       // wait for persistence
  io.emit("message", msg);           // only then does anyone see it
});
```

**✅ Idiomatic**

```js
// Broadcast optimistically with a temp id, then confirm or retract on the write result.
socket.on("message", async (msg) => {
  const tempId = `tmp-${Date.now()}`;
  io.emit("message", { ...msg, id: tempId, pending: true }); // everyone sees it instantly
  try {
    const saved = await db.insertMessage(msg);
    io.emit("message:confirmed", { tempId, message: saved }); // reconcile: real id
  } catch {
    io.emit("message:failed", { tempId });                    // clients remove/roll back
  }
});
```

**🧠 Tradeoff** — Emitting the message with a temporary id before the write lands makes a chat feel
real-time; the `confirmed`/`failed` events let clients reconcile (swap the temp id for the real one,
or remove it). This is how collaborative apps hide persistence latency. The subtlety is server-side:
you're broadcasting unconfirmed state, so clients must handle retraction, and idempotency matters if
the write is retried.

### Python

**❌ Naive**

```python
# Reflex/Flet handler awaits the server before updating the view state.
async def like(self, post_id):
    await api.like(post_id)          # UI waits for this
    self.likes[post_id] += 1
```

**✅ Idiomatic**

```python
# Optimistic update in the state model; reconcile or roll back on the result.
async def like(self, post_id):
    snapshot = self.likes[post_id]
    self.likes[post_id] = snapshot + 1     # optimistic — view updates immediately
    try:
        result = await api.like(post_id)
        self.likes[post_id] = result["likes"]  # reconcile with server
    except Exception:
        self.likes[post_id] = snapshot          # roll back
        self.error = "Couldn't like — try again"
```

**🧠 Tradeoff** — In a reactive Python UI framework (Reflex, Flet), mutating the state model
optimistically re-renders the view instantly, and the try/except handles reconcile-or-rollback — the
same shape as the JS version. The framework's reactivity does the re-render; you own the snapshot and
the failure path. It applies anywhere the client holds view state, which is exactly what these
frameworks provide.

### Elixir

**❌ Naive**

```elixir
# LiveView waits for the DB write before updating the UI.
def handle_event("like", %{"id" => id}, socket) do
  {:ok, post} = Posts.like(id)                 # blocks the UI update
  {:noreply, assign(socket, post: post)}
end
```

**✅ Idiomatic**

```elixir
# Update assigns optimistically, do the write async, reconcile via a message.
def handle_event("like", %{"id" => id}, socket) do
  socket = update(socket, :likes, &(&1 + 1))   # optimistic — re-renders immediately
  parent = self()
  Task.start(fn ->
    case Posts.like(id) do
      {:ok, post} -> send(parent, {:like_ok, post.likes})
      {:error, _} -> send(parent, {:like_failed, socket.assigns.likes - 1})
    end
  end)
  {:noreply, socket}
end

def handle_info({:like_ok, likes}, socket), do: {:noreply, assign(socket, likes: likes)}      # reconcile
def handle_info({:like_failed, prev}, socket), do:                                            # roll back
  {:noreply, socket |> assign(likes: prev) |> put_flash(:error, "Couldn't like")}
```

**🧠 Tradeoff** — LiveView re-renders the instant you update an assign, so bumping `:likes` before the
write makes it feel immediate; a `Task` does the write and messages back to reconcile or roll back.
Over LiveView's persistent socket the reconciliation round-trip is cheap. The extra machinery is the
async task + `handle_info` handlers — more explicit than `useOptimistic`, but it keeps the process
responsive while the write is in flight.

### Go

**❌ Naive**

```go
// A server handler (or a Go-driven UI) commits before acknowledging — the client waits.
func like(w http.ResponseWriter, r *http.Request) {
    if err := db.Like(id); err != nil { http.Error(w, "fail", 500); return }
    json.NewEncoder(w).Encode(count) // client only updates after the write
}
```

**✅ Idiomatic**

```go
// Client-side (or WASM/TUI) state: apply optimistically, reconcile on the async result.
type Post struct {
    Likes   int
    pending bool
}

func (a *App) Like(id string) {
    prev := a.posts[id].Likes
    a.setLikes(id, prev+1, true) // optimistic + pending → re-render now

    go func() {
        n, err := a.api.Like(id) // background request
        if err != nil {
            a.setLikes(id, prev, false) // roll back on the UI goroutine
            a.notify("Couldn't like")
            return
        }
        a.setLikes(id, n, false) // reconcile with server value
    }()
}
```

**🧠 Tradeoff** — In a Go-driven UI (WASM, a TUI, or a native app), the pattern is the same: mutate
local state optimistically, launch a goroutine for the request, and reconcile or roll back when it
returns (dispatching the state change back onto the UI goroutine). Go makes the background call
trivial with `go`; you own thread-safety on the shared UI state. Server-side Go is usually the
*responder* here, not the optimistic party — but the client shape is identical across languages.

## Applications

- **Social interactions** — likes, follows, reactions, and votes update instantly and reconcile in
  the background (frontend).
- **Chat & collaboration** — messages appear immediately with a "sending" state, confirmed or
  retracted on the server result (frontend).
- **Inline editing** — renames, toggles, and reorders apply on the spot and roll back if the save
  fails (frontend).
- **Offline-first apps** — local writes apply optimistically and sync later, reconciling conflicts on
  reconnect (frontend).
- **Carts & to-do lists** — adding/removing items reflects instantly while the server catches up
  (frontend).

## Related Patterns

- **Saga** — rollback on failure is a client-side compensation; both apply a change and undo it if a
  later step fails.
- **Unidirectional Data Flow** — optimistic updates are typically expressed as actions (apply, then a
  confirm/rollback action) through the store.
- **Reactive State** — the optimistic mutation re-renders the UI automatically because the view reacts
  to the local state it changed.
