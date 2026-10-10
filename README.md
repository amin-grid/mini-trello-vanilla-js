# Mini Trello (Vanilla JS)

A small Trello-like Kanban board built with **vanilla HTML/CSS/JS** — no frameworks, no build step required to run it.

![status](https://img.shields.io/badge/status-active-success)

## Features

- ✏️ Create cards with a title and optional description
- 🗂️ Three columns: **Todo → Doing → Done**
- ↔️ Move cards with the ← / → buttons **or** drag & drop
- ✨ Inline editing (Edit / Save / Cancel, `Esc` to abort)
- 🗑️ Delete cards
- 💾 Persists to `localStorage` and restores on reload
- 🛡️ XSS-safe rendering (user text is never inserted as HTML)
- ✅ Fully tested with Vitest

## Getting started

```bash
npm install
npm run dev      # starts a local dev server (Vite)
```

No Node.js? Any static file server works, e.g. `python3 -m http.server`, then open `index.html`.

## Scripts

| Command              | What it does                  |
| -------------------- | ----------------------------- |
| `npm run dev`        | Start the dev server          |
| `npm test`           | Run the test suite once       |
| `npm run test:watch` | Re-run tests on every change  |
| `npm run build`      | Build an optimized `dist/`    |

## Project structure

```
index.html          Markup: composer form, board columns, card <template>
src/
  state.js          Pure data layer (add/move/edit/delete + localStorage)
  render.js         Turns state into DOM (XSS-safe, full re-render)
  app.js            Wires events to state changes (event delegation)
  style.css         Styling
tests/              Vitest unit + integration tests
```

## How it works

1. **State first.** All data lives in a plain array of card objects. `src/state.js` contains only pure functions (`addCard`, `shiftCard`, `moveCardToColumn`, …) — no DOM — which makes them trivial to unit test.
2. **Render from state.** After every change, `src/render.js` repaints the board from scratch, so the DOM always mirrors the state.
3. **Event delegation.** Cards are created and destroyed constantly, so instead of attaching listeners to every button, `src/app.js` attaches **one** click listener to the board and reads `data-action` / `data-card-id` attributes from the clicked element.
4. **Persistence.** The card array is serialized to `localStorage` after every mutation and restored on startup; corrupt data degrades gracefully to an empty board.

## Testing

```bash
npm test
```

- `tests/state.test.js` — unit tests for every pure function (validation, moves, serialization, corrupt-storage recovery)
- `tests/render.test.js` — renders real state into the real `index.html` markup (column placement, counters, XSS escaping, edit mode)
- `tests/app.test.js` — full integration: boots the real app with a fake `localStorage` and simulates typing, clicking, editing, and drag & drop

## License

[MIT](./LICENSE)
