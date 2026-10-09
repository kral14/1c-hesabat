import sqlite3, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

con = sqlite3.connect('data/offline_1c_data.db')
# Check vozvrat warehouse/contract
rows = list(con.execute('SELECT number, warehouse, contract FROM documents_vozvrat LIMIT 5'))
for r in rows:
    print(r)

# Check realization
rows2 = list(con.execute('SELECT number, warehouse, contract FROM documents_realization LIMIT 5'))
for r in rows2:
    print(r)
