import re
import subprocess
import os

with open('static/js/universal_journal.js', 'r', encoding='utf-8') as f:
    orig_code = f.read()

# Let's write the transformation logic
# 1. Window DOM IDs to replace document.getElementById with this.getEl
window_ids = [
    "ujTableBody", "ujSearchInput", "ujTableWrapper", "ujLoadingState",
    "ujDebugBadge", "ujEmptyState", "ujDocTypeSelect", "ujWindowTitle",
    "ujTableHeadRow", "ujTotalRowsCount", "ujPeriodLabel", "ujBottomLoadingIndicator",
    "ujFilterCountBadge", "ujBtnClearFilter", "ujBtnQuickFilter", "ujBtnRemoveColumnFilter",
    "ujActiveFilterBadge", "ujActiveFilterName", "ujBtnEdit", "ujSearchActionBtn",
    "ujStatusRight", "ujStatusLeft"
]

code = orig_code
for wid in window_ids:
    code = code.replace(f'document.getElementById("{wid}")', f'this.getEl("{wid}")')
    code = code.replace(f"document.getElementById('{wid}')", f"this.getEl('{wid}')")

# Fix document.querySelector on loadingState
code = code.replace(
    'const loadingText = document.querySelector("#ujLoadingState div:nth-child(2)");',
    'const loadingStateEl = this.getEl("ujLoadingState");\n    const loadingText = (loadingStateEl && loadingStateEl.querySelector) ? loadingStateEl.querySelector("div:nth-child(2)") : null;'
)
code = code.replace(
    'document.querySelector("#ujLoadingState div:nth-child(2)")',
    '(this.getEl("ujLoadingState")?.querySelector ? this.getEl("ujLoadingState").querySelector("div:nth-child(2)") : null)'
)

# Fix document.getElementById("universalJournalWindow") inside methods
# We will inspect where it's used
print("Total length after initial replacement:", len(code))
