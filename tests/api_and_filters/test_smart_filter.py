# -*- coding: utf-8 -*-
import re

def build_like_filter(field_sql, input_text):
    clean = re.sub(r'["“»«”\',]', ' ', input_text).strip()
    words = [w.strip() for w in clean.split() if len(w.strip()) >= 2]
    if not words:
        words = [input_text.strip()]
    
    # Generate SQL AND conditions for words
    clauses = []
    params = {}
    for i, w in enumerate(words):
        p_name = f"Word_{i}"
        clauses.append(f"{field_sql} ПОДОБНО &{p_name}")
        params[p_name] = f"%{w}%"
    return " AND ".join(clauses), params

sql1, p1 = build_like_filter("Продажи.Контрагент.Наименование", '17811"OBA Market" MMC')
print("Kontragent SQL:", sql1)
print("Params:", p1)

sql2, p2 = build_like_filter("Продажи.Номенклатура.Наименование", '"Барни"биск.с Бананово')
print("Nomenklatura SQL:", sql2)
print("Params:", p2)
