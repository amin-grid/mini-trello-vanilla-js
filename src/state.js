// ---------------------------------------------------------------------------
// state.js — the pure data layer.
//
// Everything in this file is "pure": no DOM access, no network, no globals.
// Every function takes its inputs as arguments and returns new data instead
// of mutating what it was given. That makes the logic predictable and easy
// to test (see tests/state.test.js).
// ---------------------------------------------------------------------------

/** The three board columns, in left-to-right order. */
export const COLUMNS = Object.freeze(['todo', 'doing', 'done']);

/** localStorage key under which the board is persisted. */
export const STORAGE_KEY = 'mini-trello:cards:v1';

export const MAX_TITLE_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 300;

/**
 * Generate a unique card id.
 * Prefers the platform's crypto.randomUUID(); falls back to a random string
 * for very old environments.
 */
export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True when `column` is one of the known board columns. */
export function isValidColumn(column) {
  return COLUMNS.includes(column);
}

/**
 * Validate user input for a card.
 * Returns { ok: true, value: { title, description } } when valid,
 * otherwise { ok: false, error: 'message' }.
 */
export function validateCardInput(title, description = '') {
  const trimmedTitle = String(title ?? '').trim();
  const trimmedDescription = String(description ?? '').trim();

  if (trimmedTitle === '') {
    return { ok: false, error: 'Title is required.' };
  }
  if (trimmedTitle.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.` };
  }
  if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.` };
  }
  return { ok: true, value: { title: trimmedTitle, description: trimmedDescription } };
}

/**
 * Build a new card object. Throws if the input is invalid — callers are
 * expected to run validateCardInput() first and show the error to the user.
 */
export function createCard({
  title,
  description = '',
  column = COLUMNS[0],
  id = createId(),
  createdAt = new Date().toISOString(),
} = {}) {
  const check = validateCardInput(title, description);
  if (!check.ok) {
    throw new Error(check.error);
  }
  if (!isValidColumn(column)) {
    throw new Error(`Unknown column: "${column}"`);
  }
  return Object.freeze({
    id,
    title: check.value.title,
    description: check.value.description,
    column,
    createdAt,
  });
}

/** Return a new list with `card` appended at the end. */
export function addCard(cards, card) {
  return [...cards, card];
}

/** Return a new list without the card that has `id`. */
export function removeCard(cards, id) {
  return cards.filter((card) => card.id !== id);
}

/**
 * Return a new list where the card with `id` has `changes` merged in.
 * The id can never be changed, and an invalid column is ignored.
 */
export function updateCard(cards, id, changes = {}) {
  return cards.map((card) => {
    if (card.id !== id) return card;
    const next = { ...card, ...changes };
    next.id = card.id; // the id is immutable
    if (!isValidColumn(next.column)) next.column = card.column;
    return next;
  });
}

/**
 * Move a card one column to the left (-1) or right (+1).
 * Cards at the edge of the board stay where they are.
 */
export function shiftCard(cards, id, direction) {
  return cards.map((card) => {
    if (card.id !== id) return card;
    const nextIndex = COLUMNS.indexOf(card.column) + direction;
    if (nextIndex < 0 || nextIndex >= COLUMNS.length) return card;
    return { ...card, column: COLUMNS[nextIndex] };
  });
}

/** Move a card straight to a given column (used by drag & drop). */
export function moveCardToColumn(cards, id, column) {
  if (!isValidColumn(column)) return cards;
  return cards.map((card) => (card.id === id ? { ...card, column } : card));
}

// ---------------------------------------------------------------------------
// Persistence (localStorage)
// ---------------------------------------------------------------------------

/** Serialize a list of cards to a JSON string. */
export function serializeCards(cards) {
  return JSON.stringify(cards);
}

/** True when `card` looks like a card we can safely use from storage. */
export function isStoredCard(card) {
  return (
    card !== null &&
    typeof card === 'object' &&
    typeof card.id === 'string' &&
    card.id.length > 0 &&
    typeof card.title === 'string' &&
    card.title.trim() !== '' &&
    isValidColumn(card.column)
  );
}

/**
 * Parse stored JSON back into a list of cards.
 * Never throws: corrupt or malformed data simply becomes an empty list,
 * and individual broken entries are dropped instead of crashing the app.
 */
export function deserializeCards(json) {
  if (typeof json !== 'string' || json.trim() === '') return [];

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isStoredCard).map((card) => ({
    id: card.id,
    title: card.title,
    description: typeof card.description === 'string' ? card.description : '',
    column: card.column,
    createdAt: typeof card.createdAt === 'string' ? card.createdAt : new Date().toISOString(),
  }));
}

/** Read the board from a Storage-like object. Never throws. */
export function loadCards(storage, key = STORAGE_KEY) {
  try {
    return deserializeCards(storage.getItem(key));
  } catch {
    return [];
  }
}

/** Write the board to a Storage-like object. Returns true on success. */
export function saveCards(storage, cards, key = STORAGE_KEY) {
  try {
    storage.setItem(key, serializeCards(cards));
    return true;
  } catch {
    return false;
  }
}
