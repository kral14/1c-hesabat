import re

with open('scripts/build_and_test.py', 'r', encoding='utf-8') as f:
    s = f.read()

# Remove if (typeof this.init === "function") { this.init(); } from constructor
s = s.replace('if (typeof this.init === "function") {\n    this.init();\n  }', '// init() will be called in openDirect when opened in browser')

with open('scripts/build_and_test.py', 'w', encoding='utf-8') as f:
    f.write(s)

print("Updated build_and_test.py")
