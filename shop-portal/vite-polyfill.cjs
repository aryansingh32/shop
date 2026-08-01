if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(event, params = {}) {
      super(event, params);
      this.detail = params?.detail;
    }
  };
}
