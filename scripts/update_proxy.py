with open('scripts/build_and_test.py', 'r', encoding='utf-8') as f:
    s = f.read()

old_proxy = """const UniversalJournal = new Proxy(_UniversalJournalTarget, {
  get(target, prop, receiver) {
    if (prop in target) {
      const val = target[prop];
      if (typeof val === "function") {
        return function(...args) {
          const ctx = (this === UniversalJournal || this === target) ? target.getActiveInstance() : this;
          return val.apply(ctx, args);
        };
      }
      return val;
    }
    const inst = target.getActiveInstance();
    if (inst && prop in inst) {
      const val = inst[prop];
      if (typeof val === "function") return val.bind(inst);
      return val;
    }
    return undefined;
  },"""

new_proxy = """const UniversalJournal = new Proxy(_UniversalJournalTarget, {
  get(target, prop, receiver) {
    if (prop in target && typeof target[prop] === "function") {
      return function(...args) {
        const ctx = (this === UniversalJournal || this === target) ? target.getActiveInstance() : this;
        return target[prop].apply(ctx, args);
      };
    }
    const inst = target.getActiveInstance();
    if (inst && prop in inst) {
      return inst[prop];
    }
    return target[prop];
  },"""

# Note in python script curly braces are doubled: {{ and }}
old_proxy_escaped = old_proxy.replace("{", "{{").replace("}", "}}")
new_proxy_escaped = new_proxy.replace("{", "{{").replace("}", "}}")

assert old_proxy_escaped in s, "old_proxy_escaped not found in build_and_test.py"
s = s.replace(old_proxy_escaped, new_proxy_escaped)

with open('scripts/build_and_test.py', 'w', encoding='utf-8') as f:
    f.write(s)

print("Updated Proxy handler in build_and_test.py")
