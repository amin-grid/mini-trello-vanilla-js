// ---------------------------------------------------------------------------
// app.js — wires the UI together.
//
// Responsibilities:
//   1. Boot the app: load saved cards from localStorage, render the board.
//   2. Listen for user events and translate them into state changes.
//   3. Persist the board after every change.
//
// Two techniques worth studying here:
//   • Event delegation — instead of one listener per button (and cards are
//     created/destroyed all the time), we attach ONE click listener to the
//     board and inspect event.target to see which button was pressed.
//   • initApp(doc, storage) is exported with injectable dependencies, so the
//     integration tests can run the real app against a fake localStorage.
// ---------------------------------------------------------------------------

import {
  COLUMNS,
  addCard,
  createCard,
  loadCards,
  moveCardToColumn,
  removeCard,
  saveCards,
  shiftCard,
  updateCard,
  validateCardInput,
} from './state.js';
import { collectElements, render } from './render.js';

/**
 * Start the application.
 * @param {Document} doc     the document to query and listen on
 * @param {Storage}  storage a localStorage-compatible object
 */
export function initApp(doc = document, storage = window.localStorage) {
  // ---- application state -------------------------------------------------
  let cards = loadCards(storage);
  let editingId = null; // id of the card whose inline edit form is open

  // ---- cached DOM references ----------------------------------------------
  const els = collectElements(doc);
  const board = doc.querySelector('.board');
  const createForm = doc.getElementById('createForm');
  const titleInput = doc.getElementById('titleInput');
  const descInput = doc.getElementById('descInput');
  const formError = doc.getElementById('formError');
  const storageStatus = doc.getElementById('storageStatus');

  // ---- helpers -------------------------------------------------------------
  const persist = () => {
    const ok = saveCards(storage, cards);
    if (storageStatus) {
      storageStatus.textContent = ok
        ? `localStorage • ${cards.length} ${cards.length === 1 ? 'card' : 'cards'} saved`
        : 'localStorage unavailable — changes will not persist';
    }
  };

  const rerender = () => render({ cards, editingId }, els);

  /** Apply a new card list, then save + repaint. */
  const commit = (nextCards) => {
    cards = nextCards;
    persist();
    rerender();
  };

  // ---- composer: create new cards -------------------------------------------
  createForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const result = validateCardInput(titleInput.value, descInput.value);
    if (!result.ok) {
      formError.textContent = result.error;
      return;
    }

    formError.textContent = '';
    commit(addCard(cards, createCard(result.value)));
    createForm.reset();
    titleInput.focus();
  });

  doc.getElementById('clearBtn').addEventListener('click', () => {
    createForm.reset();
    formError.textContent = '';
    titleInput.focus();
  });

  // ---- board: one delegated click listener for every card button -----------
  board.addEventListener('click', (event) => {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;

    const cardEl = actionEl.closest('[data-card]');
    if (!cardEl) return;
    const cardId = cardEl.dataset.cardId;

    switch (actionEl.dataset.action) {
      case 'delete':
        editingId = null;
        commit(removeCard(cards, cardId));
        break;
      case 'edit':
        editingId = cardId;
        rerender();
        doc.querySelector('[data-edit-form] input[name="title"]')?.focus();
        break;
      case 'cancel-edit':
        editingId = null;
        rerender();
        break;
      case 'move-left':
        commit(shiftCard(cards, cardId, -1));
        break;
      case 'move-right':
        commit(shiftCard(cards, cardId, +1));
        break;
    }
  });

  // ---- board: delegated submit for the inline edit form --------------------
  board.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-edit-form]');
    if (!form) return;
    event.preventDefault();

    const cardId = form.closest('[data-card]').dataset.cardId;
    const errorEl = form.querySelector('.form-error');
    const result = validateCardInput(form.elements.title.value, form.elements.description.value);
    if (!result.ok) {
      errorEl.textContent = result.error;
      return;
    }

    errorEl.textContent = '';
    editingId = null;
    commit(updateCard(cards, cardId, result.value));
  });

  // Escape cancels inline editing from anywhere on the page.
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && editingId !== null) {
      editingId = null;
      rerender();
    }
  });

  // ---- drag & drop ----------------------------------------------------------
  board.addEventListener('dragstart', (event) => {
    const cardEl = event.target.closest?.('[data-card]');
    if (!cardEl || cardEl.classList.contains('card-editing')) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', cardEl.dataset.cardId);
    cardEl.classList.add('dragging');
  });

  board.addEventListener('dragend', (event) => {
    event.target.closest?.('[data-card]')?.classList.remove('dragging');
  });

  for (const column of COLUMNS) {
    const body = els.columns[column];

    body.addEventListener('dragover', (event) => {
      event.preventDefault(); // required to make the zone accept the drop
      event.dataTransfer.dropEffect = 'move';
      body.classList.add('drag-over');
    });

    body.addEventListener('dragleave', (event) => {
      // Only clear the highlight when truly leaving the column,
      // not when hovering over one of its children.
      if (!body.contains(event.relatedTarget)) body.classList.remove('drag-over');
    });

    body.addEventListener('drop', (event) => {
      event.preventDefault();
      body.classList.remove('drag-over');
      const cardId = event.dataTransfer.getData('text/plain');
      if (cardId) commit(moveCardToColumn(cards, cardId, column));
    });
  }

  // ---- first paint -----------------------------------------------------------
  persist();
  rerender();

  // Small public surface, handy for debugging and tests.
  return { getCards: () => cards };
}

// Boot automatically in the browser. The guard keeps test environments from
// initializing before they have put the app's HTML into the document.
if (typeof document !== 'undefined' && document.getElementById('createForm')) {
  initApp();
}
