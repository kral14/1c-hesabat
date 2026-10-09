import re
from collections import Counter

content = open('static/js/universal_journal.js', encoding='utf-8').read()
matches = re.findall(r'document\.getElementById\(([\'\"][a-zA-Z0-9_]+[\'\"])\)', content)
counts = Counter(matches)
print("=== DOM IDs in universal_journal.js ===")
for k, v in counts.most_common():
    print(f"{k:35} {v}")
