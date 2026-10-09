import re

content = open('static/js/universal_journal.js', encoding='utf-8').read()
window_ids = {
    "ujTableBody", "ujSearchInput", "ujTableWrapper", "ujLoadingState",
    "ujDebugBadge", "ujEmptyState", "ujDocTypeSelect", "ujWindowTitle",
    "ujTableHeadRow", "ujTotalRowsCount", "ujPeriodLabel", "ujBottomLoadingIndicator",
    "ujFilterCountBadge", "ujBtnClearFilter", "ujBtnQuickFilter", "ujBtnRemoveColumnFilter",
    "ujActiveFilterBadge", "ujActiveFilterName", "ujBtnEdit", "ujSearchActionBtn",
    "ujStatusRight", "ujStatusLeft", "universalJournalWindow"
}

for i, line in enumerate(content.splitlines(), 1):
    for wid in window_ids:
        if f'getElementById("{wid}")' in line or f"getElementById('{wid}')" in line:
            print(f"{i:4d}: {wid:26} | {line.strip()[:80]}")
