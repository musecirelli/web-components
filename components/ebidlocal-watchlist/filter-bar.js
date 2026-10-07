/**
 * <filter-bar> — text input that emits `watchlist:filter` events.
 *
 * Emits: `watchlist:filter` with detail `{ query: string }`, debounced.
 * The event bubbles, so a <watchlist-feed> in the same scope receives it
 * without any wiring — both default to listening on their shared parent.
 *
 * Attributes:
 *   placeholder - input placeholder text
 *   debounce    - debounce delay in ms (default 200)
 *   event-source - inherited: selector for the scope to emit within
 *                  (emitted events bubble from here, so scoping matters
 *                  only for which ancestors receive them)
 */
import { WebComponent } from '../../shared/component-base.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; }
    input {
      width: 100%; max-width: 480px; padding: 10px 14px; font-size: 15px;
      border: 2px solid var(--filter-bar-border, #4caf50);
      border-radius: 24px; outline: none; background: white;
      box-sizing: border-box;
    }
    input:focus { border-color: var(--filter-bar-focus, #2e7d32); }
  </style>
  <input type="text" aria-label="Filter lots by title, keyword, or category">
`;

export class FilterBar extends WebComponent {
  static get observedAttributes() {
    return ['placeholder', 'debounce'];
  }

  #timer = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    const input = this.shadowRoot.querySelector('input');
    input.placeholder = this.getAttribute('placeholder') || 'Filter by title, keyword, or category…';
    input.addEventListener('input', () => this._onInput(input.value));
  }

  attributeChangedCallback(name) {
    if (!this.isConnected) return;
    if (name === 'placeholder') {
      this.shadowRoot.querySelector('input').placeholder =
        this.getAttribute('placeholder') || 'Filter by title, keyword, or category…';
    }
  }

  _onInput(value) {
    clearTimeout(this.#timer);
    const delay = parseInt(this.getAttribute('debounce') || '200', 10);
    this.#timer = setTimeout(() => {
      this.emit('watchlist:filter', { query: value.trim().toLowerCase() });
    }, delay);
  }

  disconnectedCallback() {
    clearTimeout(this.#timer);
    super.disconnectedCallback();
  }
}

customElements.define('filter-bar', FilterBar);
