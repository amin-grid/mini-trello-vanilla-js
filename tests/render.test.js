// Tests for the renderer (src/render.js), running against a real DOM (jsdom).
import { describe, it, expect, beforeEach } from 'vitest';
import { createCard } from '../src/state.js';
import { collectElements, render } from '../src/render.js';
// ?raw makes Vite hand us the file's contents as a string, so the tests
// always run against the real markup.
import html from '../index.html?raw';

function installDom() {
  const bodyStart = html.indexOf('<body>');
  const bodyEnd = html.indexOf('</body>');
  document.body.innerHTML = html.slice(bodyStart + '<body>'.length, bodyEnd);
}

const makeCard = (overrides = {}) => createCard({ title: 'Test card', ...overrides });

let els;

beforeEach(() => {
  installDom();
  els = collectElements(document);
});

describe('collectElements', () => {
  it('finds every column, count and the card template', () => {
    for (const column of ['todo', 'doing', 'done']) {
      expect(els.columns[column], `column ${column}`).toBeInstanceOf(HTMLElement);
      expect(els.counts[column], `count ${column}`).toBeInstanceOf(HTMLElement);
    }
    expect(els.template).toBeInstanceOf(HTMLTemplateElement);
  });
});

describe('render', () => {
  it('places each card in its own column, preserving order', () => {
    const cards = [
      makeCard({ id: '1', title: 'First', column: 'todo' }),
      makeCard({ id: '2', title: 'In doing', column: 'doing' }),
      makeCard({ id: '3', title: 'Second', column: 'todo' }),
    ];
    render({ cards, editingId: null }, els);

    const todoTitles = [...els.columns.todo.querySelectorAll('[data-card-title]')].map(
      (el) => el.textContent,
    );
    expect(todoTitles).toEqual(['First', 'Second']);
    expect(els.columns.doing.textContent).toContain('In doing');
    expect(els.columns.done.textContent).toBe('');
  });

  it('updates the per-column counters', () => {
    render(
      {
        cards: [makeCard({ id: '1', column: 'todo' }), makeCard({ id: '2', column: 'todo' })],
        editingId: null,
      },
      els,
    );
    expect(els.counts.todo.textContent).toBe('2');
    expect(els.counts.doing.textContent).toBe('0');
  });

  it('escapes HTML in user text (no XSS)', () => {
    render(
      {
        cards: [makeCard({ id: '1', title: '<img src=x onerror=alert(1)>' })],
        editingId: null,
      },
      els,
    );
    expect(document.querySelector('img')).toBeNull();
    expect(els.columns.todo.querySelector('[data-card-title]').textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('removes stale cards on re-render', () => {
    render({ cards: [makeCard({ id: '1' })], editingId: null }, els);
    render({ cards: [], editingId: null }, els);
    expect(document.querySelectorAll('[data-card]').length).toBe(0);
    expect(els.counts.todo.textContent).toBe('0');
  });

  it('makes cards draggable and tags them with their id', () => {
    render({ cards: [makeCard({ id: 'abc' })], editingId: null }, els);
    const article = els.columns.todo.querySelector('[data-card]');
    expect(article.dataset.cardId).toBe('abc');
    expect(article.draggable).toBe(true);
  });
});

describe('inline editing', () => {
  it('renders an edit form with the current values when editingId matches', () => {
    const card = makeCard({ id: '1', title: 'Old title', description: 'Old details' });
    render({ cards: [card], editingId: '1' }, els);

    const form = els.columns.todo.querySelector('[data-edit-form]');
    expect(form).not.toBeNull();
    expect(form.elements.title.value).toBe('Old title');
    expect(form.elements.description.value).toBe('Old details');
    // The editing card itself must not be draggable.
    expect(form.closest('[data-card]').hasAttribute('draggable')).toBe(false);
  });

  it('renders the normal card when editingId is a different card', () => {
    const card = makeCard({ id: '1', title: 'Readonly' });
    render({ cards: [card], editingId: 'other' }, els);
    expect(els.columns.todo.querySelector('[data-edit-form]')).toBeNull();
    expect(els.columns.todo.querySelector('[data-card-title]').textContent).toBe('Readonly');
  });
});
