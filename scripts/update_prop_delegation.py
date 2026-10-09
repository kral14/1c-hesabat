with open('scripts/build_and_test.py', 'r', encoding='utf-8') as f:
    s = f.read()

# Replace delegatedProps loop in build_and_test.py
old_block = """for (const prop of delegatedProps) {
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

new_block = """for (const prop of delegatedProps) {
  Object.defineProperty(UniversalJournal, prop, {
    get() {
      const inst = this === UniversalJournal ? UniversalJournal.getActiveInstance() : this;
      return inst ? inst[prop] : undefined;
    },
    set(val) {
      const inst = this === UniversalJournal ? UniversalJournal.getActiveInstance() : this;
      if (inst) {
        Object.defineProperty(inst, prop, {
          value: val,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
    },
    configurable: true,
    enumerable: true
  });
}"""

assert old_block in s
s = s.replace(old_block, new_block)

with open('scripts/build_and_test.py', 'w', encoding='utf-8') as f:
    f.write(s)

print("Updated build_and_test.py with safe property delegation")
