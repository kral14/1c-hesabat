with open('scripts/build_and_test.py', 'r', encoding='utf-8') as f:
    s = f.read()

old_active = """  isJournalActive: function() {
    const win = document.getElementById("universalJournalWindow");
    return Boolean(win && win.style.display !== "none");
  },"""

new_active = """  isJournalActive: function() {
    if (typeof MdiManager !== "undefined" && MdiManager.activeWindowId) {
      const myId = this.windowId || "universalJournalWindow";
      if (MdiManager.activeWindowId !== myId) return false;
    }
    const win = this.windowElement || ((typeof document !== "undefined" && document.getElementById) ? document.getElementById(this.windowId || "universalJournalWindow") : null);
    return Boolean(win && win.style.display !== "none");
  },"""

assert old_active in s, "old_active not found"
s = s.replace(old_active, new_active)

with open('scripts/build_and_test.py', 'w', encoding='utf-8') as f:
    f.write(s)

print("Updated isJournalActive in build_and_test.py")
