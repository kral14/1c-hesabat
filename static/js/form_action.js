/* Shared explicit generation command for buttons and the active window shortcut. */
window.FormAction = {
  actions: new Map(),
  busy: new Set(),
  register(windowId, action) { this.actions.set(windowId, action); },
  confirm(windowId) {
    const action = this.actions.get(windowId);
    if (!action) return false;
    action();
    return true;
  },
  async run({key, collect, validate, close, execute, onError}) {
    if (this.busy.has(key)) return false;
    this.busy.add(key);
    try {
      const settings = collect();
      if (validate) validate(settings);
      if (close) close();
      await execute(settings);
      return true;
    } catch (error) {
      if (onError) onError(error);
      else console.error(error);
      return false;
    } finally { this.busy.delete(key); }
  }
};
