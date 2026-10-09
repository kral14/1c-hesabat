# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import sqlite3
import os

p = "data/offline_1c_data.db"
conn = sqlite3.connect(p)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
size_mb = os.path.getsize(p) / (1024 * 1024)

print("=" * 60)
print(f"OFFLINE BAZANIN STATİSTİKASI: {size_mb:.2f} MB")
print("=" * 60)
total_rows = 0
for t in tables:
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    cnt = cur.fetchone()[0]
    total_rows += cnt
    print(f"  {t:<32}: {cnt:>10,}")
print("-" * 60)
print(f"  {'CƏMİ SƏTİR SAYI':<32}: {total_rows:>10,}")
print("=" * 60)

# Check sample realization with pogruzka
cur.execute("SELECT number, date, kontragent, amount, pogruzka_marshrut, pogruzka_voditel FROM documents_realization WHERE pogruzka_marshrut IS NOT NULL AND pogruzka_marshrut != '' LIMIT 3")
print("\nSample Realization with Pogruzka:")
for r in cur.fetchall():
    print(" ", r)
