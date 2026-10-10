// Unit tests for the pure data layer (src/state.js).
import { describe, it, expect } from 'vitest';
import {
  COLUMNS,
  STORAGE_KEY,
  addCard,
  createCard,
  createId,
  deserializeCards,
  isValidColumn,
  loadCards,
  moveCardToColumn,
  removeCard,
  saveCards,
  serializeCards,
  shiftCard,
  updateCard,
  validateCardInput,
} from '../src/state.js';

const makeCard = (overrides = {}) =>
  createCard({ title: 'Test card', description: '', column: 'todo', ...overrides });

describe('createId', () => {
  it('produces unique, non-empty ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
  });
});

describe('validateCardInput', () => {
  it('accepts a normal title', () => {
    expect(validateCardInput('Fix bug')).toEqual({
      ok: true,
      value: { title: 'Fix bug', description: '' },
    });
  });

  it('trims surrounding whitespace', () => {
    const result = validateCardInput('  Fix bug  ', '  details  ');
    expect(result.value).toEqual({ title: 'Fix bug', description: 'details' });
  });

  it('rejects an empty or whitespace-only title', () => {
    expect(validateCardInput('').ok).toBe(false);
    expect(validateCardInput('   ').ok).toBe(false);
  });

  it('rejects a title longer than the limit', () => {
    expect(validateCardInput('x'.repeat(81)).ok).toBe(false);
    expect(validateCardInput('x'.repeat(80)).ok).toBe(true);
  });

  it('rejects a description longer than the limit', () => {
    expect(validateCardInput('ok', 'x'.repeat(301)).ok).toBe(false);
  });
});

describe('createCard', () => {
  it('creates a card with defaults', () => {
    const card = createCard({ title: 'Hello' });
    expect(card).toMatchObject({ title: 'Hello', description: '', column: 'todo' });
    expect(card.id).toBeTruthy();
    expect(card.createdAt).toBeTruthy();
  });

  it('throws on invalid input', () => {
    expect(() => createCard({ title: '' })).toThrow();
    expect(() => createCard({ title: 'ok', column: 'nope' })).toThrow(/Unknown column/);
  });
});

describe('card list operations', () => {
  it('addCard appends without mutating the original array', () => {
    const before = [makeCard({ id: 'a' })];
    const after = addCard(before, makeCard({ id: 'b' }));
    expect(after).toHaveLength(2);
    expect(before).toHaveLength(1); // original untouched
    expect(after[1].id).toBe('b');
  });

  it('removeCard drops only the matching card', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b' })];
    const after = removeCard(cards, 'a');
    expect(after.map((c) => c.id)).toEqual(['b']);
  });

  it('updateCard merges changes but never changes the id', () => {
    const cards = [makeCard({ id: 'a', title: 'old' })];
    const after = updateCard(cards, 'a', { title: 'new', id: 'evil' });
    expect(after[0].title).toBe('new');
    expect(after[0].id).toBe('a');
  });

  it('updateCard ignores an invalid column', () => {
    const cards = [makeCard({ id: 'a', column: 'todo' })];
    const after = updateCard(cards, 'a', { column: 'nope' });
    expect(after[0].column).toBe('todo');
  });

  it('updateCard leaves other cards alone', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b' })];
    const after = updateCard(cards, 'a', { title: 'changed' });
    expect(after[1].title).toBe('Test card');
  });
});

describe('shiftCard', () => {
  it('moves a card right', () => {
    const after = shiftCard([makeCard({ id: 'a', column: 'todo' })], 'a', +1);
    expect(after[0].column).toBe('doing');
  });

  it('moves a card left', () => {
    const after = shiftCard([makeCard({ id: 'a', column: 'done' })], 'a', -1);
    expect(after[0].column).toBe('doing');
  });

  it('does not move past the left edge', () => {
    const after = shiftCard([makeCard({ id: 'a', column: 'todo' })], 'a', -1);
    expect(after[0].column).toBe('todo');
  });

  it('does not move past the right edge', () => {
    const after = shiftCard([makeCard({ id: 'a', column: 'done' })], 'a', +1);
    expect(after[0].column).toBe('done');
  });
});

describe('moveCardToColumn', () => {
  it('moves a card straight to a column', () => {
    const after = moveCardToColumn([makeCard({ id: 'a' })], 'a', 'done');
    expect(after[0].column).toBe('done');
  });

  it('ignores unknown columns', () => {
    const cards = [makeCard({ id: 'a' })];
    const after = moveCardToColumn(cards, 'a', 'nope');
    expect(after[0].column).toBe('todo');
  });
});

describe('serialization', () => {
  it('round-trips cards through JSON', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b', column: 'done' })];
    expect(deserializeCards(serializeCards(cards))).toEqual(cards);
  });

  it('returns [] for empty, corrupt or non-array JSON', () => {
    expect(deserializeCards('')).toEqual([]);
    expect(deserializeCards(undefined)).toEqual([]);
    expect(deserializeCards('{oops')).toEqual([]);
    expect(deserializeCards('{"not":"an array"}')).toEqual([]);
  });

  it('drops malformed entries but keeps the good ones', () => {
    const json = JSON.stringify([
      { id: 'a', title: 'good', column: 'todo' },
      null,
      { id: '', title: 'missing id', column: 'todo' },
      { id: 'c', title: 'bad column', column: 'nope' },
      { id: 'd', title: 'also good', column: 'doing' },
    ]);
    const cards = deserializeCards(json);
    expect(cards.map((c) => c.id)).toEqual(['a', 'd']);
    expect(cards[0].description).toBe(''); // missing description defaults
  });
});

describe('loadCards / saveCards', () => {
  const makeStorage = (initial = {}) => {
    const data = { ...initial };
    return {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => {
        data[k] = String(v);
      },
    };
  };

  it('saves under the versioned key and loads back', () => {
    const storage = makeStorage();
    const cards = [makeCard({ id: 'a' })];
    expect(saveCards(storage, cards)).toBe(true);
    expect(loadCards(storage)).toEqual(cards);
  });

  it('reads nothing when storage is empty', () => {
    expect(loadCards(makeStorage())).toEqual([]);
  });

  it('recovers from corrupt stored data', () => {
    const storage = makeStorage({ [STORAGE_KEY]: 'not json at all' });
    expect(loadCards(storage)).toEqual([]);
  });

  it('survives a throwing storage (e.g. quota exceeded, privacy mode)', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadCards(broken)).toEqual([]);
    expect(saveCards(broken, [])).toBe(false);
  });
});
