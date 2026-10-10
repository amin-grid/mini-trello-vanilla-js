// ---------------------------------------------------------------------------
// render.js — turns application state into DOM.
//
// This file only *draws* the UI; it never changes state. The flow is always:
//   user event → change state (state.js) → render() repaints the board.
//
// Security note: user text is inserted with textContent / input.value,
// never with innerHTML, so card titles can never inject HTML or scripts.
// ---------------------------------------------------------------------------

import { COLUMNS, MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH } from './state.js';

/**
 * Look up the DOM nodes the renderer needs, once, at startup.
 * Caching them avoids repeated querySelector calls on every render.
 */
export function collectElements(root = document) {
  return {
    columns: Object.fromEntries(
      COLUMNS.map((column) => [column, root.querySelector(`[data-dropzone="${column}"]`)]),
    ),
    counts: Object.fromEntries(
      COLUMNS.map((column) => [column, root.querySelector(`[data-count="${column}"]`)]),
    ),
    template: root.getElementById('cardTemplate'),
  };
}

/**
 * Repaint the whole board from `state`.
 * `state` is { cards: Card[], editingId: string | null }.
 *
 * A full re-render keeps the code dead simple: the DOM always mirrors the
 * state, so there are no "the UI forgot to update" bugs. For a board this
 * size the performance cost is invisible.
 */
export function render(state, els) {
  for (const column of COLUMNS) {
    const cardsInColumn = state.cards.filter((card) => card.column === column);

    // replaceChildren() removes every old node and inserts the new ones.
    els.columns[column].replaceChildren(
      ...cardsInColumn.map((card) =>
        createCardElement(card, state.editingId === card.id, els.template),
      ),
    );

    els.counts[column].textContent = String(cardsInColumn.length);
  }
}

/** Build the DOM node for one card (or its inline edit form). */
export function createCardElement(card, isEditing, template) {
  return isEditing ? createEditElement(card, template) : createReadonlyElement(card, template);
}

/** Clone the <template> from index.html and fill it with one card's data. */
function createReadonlyElement(card, template) {
  const fragment = template.content.cloneNode(true);
  const article = fragment.querySelector('[data-card]');

  article.dataset.cardId = card.id; // used by event delegation & drag/drop
  article.draggable = true;

  // textContent is XSS-safe: "<script>" stays literal text.
  fragment.querySelector('[data-card-title]').textContent = card.title;
  const desc = fragment.querySelector('[data-card-desc]');
  desc.textContent = card.description; // hidden via CSS :empty when ''

  return fragment;
}

/** Build the inline "edit card" form shown when a card is being edited. */
function createEditElement(card, template) {
  const doc = template.ownerDocument;

  const article = doc.createElement('article');
  article.className = 'card card-editing';
  // Same marker attribute as the <template> version — event delegation
  // in app.js relies on it to find the card an event belongs to.
  article.setAttribute('data-card', '');
  article.dataset.cardId = card.id;

  const form = doc.createElement('form');
  form.className = 'card-edit-form';
  form.dataset.editForm = '';
  form.setAttribute('autocomplete', 'off');

  const titleInput = doc.createElement('input');
  titleInput.name = 'title';
  titleInput.type = 'text';
  titleInput.maxLength = MAX_TITLE_LENGTH;
  titleInput.required = true;
  titleInput.value = card.title;
  titleInput.setAttribute('aria-label', 'Card title');

  const descInput = doc.createElement('textarea');
  descInput.name = 'description';
  descInput.rows = 2;
  descInput.maxLength = MAX_DESCRIPTION_LENGTH;
  descInput.value = card.description;
  descInput.setAttribute('aria-label', 'Card description');

  const error = doc.createElement('p');
  error.className = 'form-error';
  error.setAttribute('role', 'status');
  error.setAttribute('aria-live', 'polite');

  const actions = doc.createElement('div');
  actions.className = 'card-edit-actions';

  const saveButton = doc.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'btn btn-small btn-primary';
  saveButton.textContent = 'Save';

  const cancelButton = doc.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-small';
  cancelButton.dataset.action = 'cancel-edit';
  cancelButton.textContent = 'Cancel';

  actions.append(saveButton, cancelButton);
  form.append(titleInput, descInput, error, actions);
  article.append(form);
  return article;
}
