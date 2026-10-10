// Integration tests: boot the REAL app (initApp) against the REAL index.html
// markup and drive it like a user would — typing, clicking, dragging.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STORAGE_KEY } from '../src/state.js';
import { initApp } from '../src/app.js';
// ?raw makes Vite hand us the file's contents as a string, so the tests
// always run against the real markup.
import html from '../index.html?raw';

function installDom() {
  const bodyStart = html.indexOf('<body>');
  const bodyEnd = html.indexOf('</body>');
  document.body.innerHTML = html.slice(bodyStart + '<body>'.length, bodyEnd);
}

/** A tiny in-memory replacement for localStorage. */
function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
    _data: data,
  };
}

let storage;

function boot(preload = {}) {
  installDom();
  storage = createMemoryStorage(preload);
  initApp(document, storage);
}

const $ = (selector) => document.querySelector(selector);

function createCardThroughForm(title, description = '') {
  $('#titleInput').value = title;
  $('#descInput').value = description;
  $('#createForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function cardArticles() {
  return [...document.querySelectorAll('[data-card]')];
}

describe('creating cards', () => {
  beforeEach(() => boot());

  it('adds a card to the Todo column and persists it', () => {
    createCardThroughForm('Fix login bug', 'Repro: wrong password');

    const card = $('.column-todo [data-card]');
    expect(card).not.toBeNull();
    expect(card.querySelector('[data-card-title]').textContent).toBe('Fix login bug');
    expect(card.querySelector('[data-card-desc]').textContent).toBe('Repro: wrong password');
    expect($('[data-count="todo"]').textContent).toBe('1');

    const stored = JSON.parse(storage.getItem(STORAGE_KEY));
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Fix login bug');
  });

  it('resets the composer form after submitting', () => {
    createCardThroughForm('Something');
    expect($('#titleInput').value).toBe('');
    expect($('#descInput').value).toBe('');
  });

  it('shows an error and adds nothing for an empty title', () => {
    createCardThroughForm('   ');
    expect($('#formError').textContent).toBe('Title is required.');
    expect(cardArticles()).toHaveLength(0);
    expect(storage.getItem(STORAGE_KEY)).toBe('[]');
  });

  it('clears the previous error once a valid card is submitted', () => {
    createCardThroughForm('');
    expect($('#formError').textContent).not.toBe('');
    createCardThroughForm('Valid now');
    expect($('#formError').textContent).toBe('');
  });

  it('the Clear button empties the form and the error', () => {
    $('#titleInput').value = 'draft';
    createCardThroughForm(''); // trigger an error first
    $('#clearBtn').click();
    expect($('#titleInput').value).toBe('');
    expect($('#formError').textContent).toBe('');
  });
});

describe('moving cards', () => {
  beforeEach(() => {
    boot();
    createCardThroughForm('Move me');
  });

  it('moves a card right, then left again', () => {
    $('[data-action="move-right"]').click();
    expect($('.column-doing [data-card]')).not.toBeNull();
    expect($('[data-count="doing"]').textContent).toBe('1');
    expect($('[data-count="todo"]').textContent).toBe('0');

    $('[data-action="move-left"]').click();
    expect($('.column-todo [data-card]')).not.toBeNull();
  });

  it('keeps a card in Todo when moved left from the left edge', () => {
    $('[data-action="move-left"]').click();
    expect($('.column-todo [data-card]')).not.toBeNull();
  });
});

describe('deleting cards', () => {
  it('removes the card and updates counts and storage', () => {
    boot();
    createCardThroughForm('Delete me');
    expect(cardArticles()).toHaveLength(1);

    $('[data-action="delete"]').click();

    expect(cardArticles()).toHaveLength(0);
    expect($('[data-count="todo"]').textContent).toBe('0');
    expect(storage.getItem(STORAGE_KEY)).toBe('[]');
  });
});

describe('editing cards', () => {
  beforeEach(() => {
    boot();
    createCardThroughForm('Original', 'Details');
  });

  it('opens an inline form prefilled with the card values', () => {
    $('[data-action="edit"]').click();
    const form = $('[data-edit-form]');
    expect(form).not.toBeNull();
    expect(form.elements.title.value).toBe('Original');
    expect(form.elements.description.value).toBe('Details');
  });

  it('saves changes and closes the form', () => {
    $('[data-action="edit"]').click();
    const form = $('[data-edit-form]');
    form.elements.title.value = 'Updated';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect($('[data-edit-form]')).toBeNull();
    expect($('[data-card-title]').textContent).toBe('Updated');
    expect(JSON.parse(storage.getItem(STORAGE_KEY))[0].title).toBe('Updated');
  });

  it('rejects an empty title inside the edit form', () => {
    $('[data-action="edit"]').click();
    const form = $('[data-edit-form]');
    form.elements.title.value = '   ';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(form.querySelector('.form-error').textContent).toBe('Title is required.');
    expect($('[data-edit-form]')).not.toBeNull(); // still editing
  });

  it('Cancel restores the card without saving', () => {
    $('[data-action="edit"]').click();
    $('[data-edit-form]').elements.title.value = 'Never saved';
    $('[data-action="cancel-edit"]').click();

    expect($('[data-card-title]').textContent).toBe('Original');
    expect($('[data-edit-form]')).toBeNull();
  });

  it('Escape cancels editing', () => {
    $('[data-action="edit"]').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('[data-edit-form]')).toBeNull();
    expect($('[data-card-title]').textContent).toBe('Original');
  });
});

describe('drag and drop', () => {
  beforeEach(() => {
    boot();
    createCardThroughForm('Drag me');
  });

  function dragTo(columnName) {
    const article = $('[data-card]');
    const payload = {};

    const dragstart = new Event('dragstart', { bubbles: true });
    dragstart.dataTransfer = { setData: (k, v) => (payload[k] = v), effectAllowed: '' };
    article.dispatchEvent(dragstart);

    const target = $(`[data-dropzone="${columnName}"]`);

    const dragover = new Event('dragover', { bubbles: true, cancelable: true });
    dragover.dataTransfer = { dropEffect: '' };
    target.dispatchEvent(dragover);

    const drop = new Event('drop', { bubbles: true, cancelable: true });
    drop.dataTransfer = { getData: (k) => payload[k] ?? '' };
    target.dispatchEvent(drop);
  }

  it('moves the card into the column it is dropped on', () => {
    dragTo('doing');
    expect($('.column-doing [data-card]')).not.toBeNull();
    expect($('.column-todo [data-card]')).toBeNull();
    expect(JSON.parse(storage.getItem(STORAGE_KEY))[0].column).toBe('doing');
  });

  it('highlights the column while dragging over it', () => {
    const article = $('[data-card]');
    const dragstart = new Event('dragstart', { bubbles: true });
    dragstart.dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    article.dispatchEvent(dragstart);

    const target = $('[data-dropzone="done"]');
    const dragover = new Event('dragover', { bubbles: true, cancelable: true });
    dragover.dataTransfer = { dropEffect: '' };
    target.dispatchEvent(dragover);

    expect(target.classList.contains('drag-over')).toBe(true);
  });
});

describe('persistence on startup', () => {
  it('restores saved cards when the app boots', () => {
    const saved = JSON.stringify([
      { id: 'a', title: 'Restored', description: '', column: 'done', createdAt: 'x' },
    ]);
    boot({ [STORAGE_KEY]: saved });

    expect($('.column-done [data-card-title]').textContent).toBe('Restored');
    expect($('[data-count="done"]').textContent).toBe('1');
  });

  it('boots fine even if the stored data is corrupt', () => {
    expect(() => boot({ [STORAGE_KEY]: 'garbage{' })).not.toThrow();
    expect(cardArticles()).toHaveLength(0);
  });

  it('reports the storage status in the footer', () => {
    boot();
    createCardThroughForm('One');
    expect($('#storageStatus').textContent).toContain('1 card saved');
  });
});
