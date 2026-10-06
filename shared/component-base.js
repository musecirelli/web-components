/**
 * WebComponent — base class for the web-components monorepo.
 *
 * Implements the repo's communication conventions:
 *
 * 1. MESSAGE PASSING (events): components communicate by dispatching and
 *    listening for CustomEvents. All emitted events bubble and are composed,
 *    so they cross shadow DOM boundaries.
 *
 * 2. EVENT SCOPING: components listen for events on a scoped source element,
 *    resolved in this order:
 *      a. the `event-source` attribute (a CSS selector), if present;
 *      b. the component's parent element, if it is an element;
 *      c. `document.body` as the default.
 *    Prefer scoping to the parent — it is usually the thing using the
 *    component and passing it data — and use `event-source` to widen the
 *    scope when the component must be useful outside its parent.
 *
 * 3. ATTRIBUTES: configuration flows in through DOM attributes
 *    (observed via `observedAttributes` + `attributeChangedCallback`).
 *
 * 4. SLOTS: customizable content flows in through <slot> elements.
 *
 * Design notes:
 * - `on()` tracks listeners so `disconnectedCallback` can remove them all.
 *   Subclasses that override `disconnectedCallback` MUST call `super`.
 * - `emit()` always sets `bubbles: true, composed: true, cancelable: true`.
 * - Event names use the `namespace:action` convention, e.g. `watchlist:data`.
 */
export class WebComponent extends HTMLElement {
  /** @type {Array<{target: EventTarget, type: string, handler: EventListener, options: AddEventListenerOptions}>} */
  #listeners = [];

  /**
   * Resolve the element this component listens for events on.
   * Order:
   *   a. the `event-source` attribute (a CSS selector), if present;
   *   b. the shadow host, if this component lives in a shadow tree —
   *      the host is the containing element;
   *   c. the component's parent element;
   *   d. `document.body` as the default.
   * @returns {Element}
   */
  get eventSource() {
    const selector = this.getAttribute('event-source');
    if (selector) {
      const el = document.querySelector(selector);
      if (el) return el;
      console.warn(
        `[${this.tagName.toLowerCase()}] event-source selector "${selector}" matched nothing; falling back.`
      );
    }
    const root = this.getRootNode();
    if (root instanceof ShadowRoot) return root.host;
    if (this.parentElement) return this.parentElement;
    return document.body;
  }

  /**
   * Listen for an event on this component's event source.
   * The listener is tracked and removed automatically on disconnect.
   * @param {string} type - event type, e.g. 'watchlist:data'
   * @param {(event: CustomEvent) => void} handler
   * @param {AddEventListenerOptions} [options]
   * @returns {this}
   */
  on(type, handler, options = {}) {
    const target = this.eventSource;
    const wrapped = (event) => handler(event);
    target.addEventListener(type, wrapped, options);
    this.#listeners.push({ target, type, handler: wrapped, options });
    return this;
  }

  /**
   * Stop listening for a previously registered event.
   * @param {string} type
   * @param {EventListener} handler - the original handler passed to on()
   * @returns {this}
   */
  off(type, handler) {
    const idx = this.#listeners.findIndex(
      (l) => l.type === type && l.handler === handler
    );
    if (idx !== -1) {
      const { target, handler: wrapped, options } = this.#listeners[idx];
      target.removeEventListener(type, wrapped, options);
      this.#listeners.splice(idx, 1);
    }
    return this;
  }

  /**
   * Dispatch a bubbling, composed CustomEvent from this component.
   * @param {string} type - event type, e.g. 'watchlist:filter'
   * @param {*} [detail] - event payload
   * @returns {boolean} false if the event was canceled
   */
  emit(type, detail = null) {
    return this.dispatchEvent(
      new CustomEvent(type, {
        detail,
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
  }

  /**
   * Re-resolve the event source. Call after the `event-source` attribute
   * changes if listeners were bound before the attribute was set.
   * Subclasses typically call this from attributeChangedCallback.
   * @protected
   */
  _rebindEventSource() {
    const tracked = [...this.#listeners];
    this.#listeners = [];
    for (const { type, handler, options } of tracked) {
      const target = this.eventSource;
      target.addEventListener(type, handler, options);
      this.#listeners.push({ target, type, handler, options });
    }
  }

  disconnectedCallback() {
    for (const { target, type, handler, options } of this.#listeners) {
      target.removeEventListener(type, handler, options);
    }
    this.#listeners = [];
  }
}
