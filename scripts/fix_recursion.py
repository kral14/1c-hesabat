with open('scripts/build_and_test.py', 'r', encoding='utf-8') as f:
    s = f.read()

old_prop_def = """for (const prop of delegatedProps) {
  Object.defineProperty(UniversalJournal, prop, {
    get() {
      const inst = UniversalJournal.getActiveInstance();
      return inst ? inst[prop] : undefined;
    },
    set(val) {
      const inst = UniversalJournal.getActiveInstance();
      if (inst) inst[prop] = val;
    },
    configurable: true,
    enumerable: true
  });
}"""

new_prop_def = """for (const prop of delegatedProps) {
  Object.defineProperty(UniversalJournal, prop, {
    get() {
      const inst = UniversalJournal.getActiveInstance();
      if (inst && Object.prototype.hasOwnProperty.call(inst, prop)) {
        return inst[prop];
      }
      return inst ? inst["_" + prop] : undefined;
    },
    set(val) {
      const inst = UniversalJournal.getActiveInstance();
      if (inst) {
        Object.defineProperty(inst, prop, {
          value: val,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    },
    configurable: true,
    enumerable: true
  });
}"""

s = s.replace(old_prop_def, new_prop_def)

# Also in JournalInstance constructor, initialize currentLoadSessionId
s = s.replace('this.hasMoreDocs = true;', 'this.hasMoreDocs = true;\n  this.currentLoadSessionId = 0;')

with open('scripts/build_and_test.py', 'w', encoding='utf-8') as f:
    f.write(s)

print("Updated getter/setter in build_and_test.py")
