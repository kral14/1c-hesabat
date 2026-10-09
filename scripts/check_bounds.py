import re
import subprocess
import os

with open('static/js/universal_journal.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Let's inspect where UniversalJournal starts and ends
start_idx = code.find('const UniversalJournal = {')
end_idx = code.find('\nwindow.UniversalJournal = UniversalJournal;')

print(f"Start: {start_idx}, End: {end_idx}")
assert start_idx != -1 and end_idx != -1
