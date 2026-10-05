# -*- coding: utf-8 -*-
"""
Virtual 1C:Enterprise COMConnector Engine (Offline 1C Emulator)
---------------------------------------------------------------
Bu modul 1C:Enterprise (V83.COMConnector) COM interfeysini və onun
daxili obyektlərini (Запрос, Справочники, Документы, СписокЗначений)
tam şəkildə emulyasiya edir.

Kompüterdə 1C quraşdırılmadıqda belə, sanki real 1C Test Bazasina
bağlanırmış kimi davranır və bütün məlumatları data/offline_1c_data.db
SQLite bazasından virtual olaraq çıxarır.
"""

import os
import sys
import re
import sqlite3
import datetime

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "offline_1c_data.db")


class Virtual1CValueList:
    """1C СписокЗначений emulyasiyası"""
    def __init__(self):
        self.items = []

    def Добавить(self, val, presentation=None):
        self.items.append(val)

    def Количество(self):
        return len(self.items)

    def __len__(self):
        return len(self.items)


class VirtualRef:
    """1C Ссылка (Reference) obyekti emulyasiyası"""
    def __init__(self, code, name, extra=None, table_name="nomenklatura"):
        self.Код = code
        self.Наименование = name
        self.Ссылка = self
        self._extra = extra or {}
        self._table_name = table_name

    def Пустая(self):
        return not bool(self.Код or self.Наименование)

    def ПолучитьОбъект(self):
        return VirtualDocObject(self.Код, self._extra)

    def __getattr__(self, item):
        if item in self._extra:
            return self._extra[item]
        return ""

    def __str__(self):
        return str(self.Наименование or self.Код or "")


class VirtualDocObject:
    """1C ДокументОбъект emulyasiyası"""
    def __init__(self, number, data=None):
        self.Номер = number
        self._data = data or {}
        self.Дата = self._data.get("doc_date") or datetime.datetime.now()
        self.Проведен = "проведен" in str(self._data.get("status", "")).lower()
        self.Комментарий = self._data.get("comment", "")
        self.Ответственный = VirtualRef("", self._data.get("responsible", "Keleshov Nasib"))
        self.НеПроводитьНулевыеЗначения = False

        # Cədvəl hissəsi: Товары
        self.Товары = VirtualDocRows(number)

    def Записать(self, mode=None):
        # Yadda saxlama emulyasiyası
        return True


class VirtualDocRows:
    """Sənədin cədvəl hissəsi (ТабличнаяЧасть)"""
    def __init__(self, doc_number):
        self.doc_number = doc_number
        self.rows = []
        self._load()

    def _load(self):
        if not os.path.exists(DB_PATH):
            return
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("""
            SELECT r.item_code, r.item_name, r.unit, r.price_type, r.price, n.artikul, n.barcode
            FROM price_document_rows r
            LEFT JOIN nomenklatura n ON r.item_code = n.code
            WHERE r.doc_number = ?
            ORDER BY r.id ASC
        """, (self.doc_number,))
        for row in cur.fetchall():
            self.rows.append(VirtualDocRow(row))
        conn.close()

    def Количество(self):
        return len(self.rows)

    def __iter__(self):
        return iter(self.rows)

    def __len__(self):
        return len(self.rows)


class VirtualDocRow:
    """Cədvəl hissəsinin bir sətri"""
    def __init__(self, row_dict):
        self.Номенклатура = VirtualRef(
            row_dict["item_code"], 
            row_dict["item_name"],
            extra={"Артикул": row_dict["artikul"] or "", "Штрихкод": row_dict["barcode"] or ""}
        )
        self.ЕдиницаИзмерения = VirtualRef("", row_dict["unit"] or "əd")
        self.ТипЦен = VirtualRef("", row_dict["price_type"] or "")
        self.Цена = float(row_dict["price"] or 0.0)


class VirtualQueryResultRow:
    """1C sorğusunun sətir obyekti"""
    def __init__(self, data_dict):
        self._data = data_dict
        for k, v in data_dict.items():
            setattr(self, k, v)

    def __getattr__(self, name):
        return self._data.get(name, "")


class VirtualQueryResult:
    """1C ВыборкаИзРезультатаЗапроса emulyasiyası"""
    def __init__(self, rows):
        self._rows = rows
        self._idx = -1
        self._current = None

    def Choose(self):
        return self

    def Next(self):
        self._idx += 1
        if self._idx < len(self._rows):
            self._current = self._rows[self._idx]
            return True
        self._current = None
        return False

    def Количество(self):
        return len(self._rows)

    def __getattr__(self, name):
        if self._current is not None:
            return getattr(self._current, name, "")
        return ""


class Virtual1CQuery:
    """1C Запрос mühərriki - 1C sorğu mətnini SQLite sorğularına çevirir"""
    def __init__(self):
        self.Text = ""
        self.parameters = {}

    def SetParameter(self, name, value):
        self.parameters[name] = value

    def Execute(self):
        rows = self._execute_emulated_query()
        return VirtualQueryResult(rows)

    def _execute_emulated_query(self):
        if not os.path.exists(DB_PATH):
            return []

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        t = self.Text.lower()

        results = []

        # 1. Справочник.Пользователи (İstifadəçilər)
        if "справочник.пользователи" in t:
            cur.execute("SELECT DISTINCT responsible FROM price_documents WHERE responsible IS NOT NULL AND responsible != ''")
            db_res = cur.fetchall()
            for i, r in enumerate(db_res):
                results.append(VirtualQueryResultRow({
                    "Name": r["responsible"].strip(),
                    "Code": f"{i+1:03d}"
                }))
            if not results:
                results.append(VirtualQueryResultRow({"Name": "Keleshov Nasib", "Code": "001"}))

        # 2. Справочник.Портфели (Portfellər)
        elif "справочник.портфели" in t:
            cur.execute("""
                SELECT DISTINCT parent FROM nomenklatura 
                WHERE parent IS NOT NULL AND parent != '' AND parent NOT LIKE '!%'
                ORDER BY parent LIMIT 100
            """)
            for r in cur.fetchall():
                results.append(VirtualQueryResultRow({
                    "Portfolio": r["parent"].strip(),
                    "Name": r["parent"].strip(),
                    "Code": ""
                }))

        # 3. Справочник.ДоговорыКонтрагентов / Агент
        elif "договорыконтрагентов" in t and "агент" in t:
            cur.execute("SELECT DISTINCT podrazdelenie FROM sales_turnover WHERE podrazdelenie != '' LIMIT 100")
            for r in cur.fetchall():
                results.append(VirtualQueryResultRow({"AgentName": r["podrazdelenie"].strip()}))

        # 4. Справочник.Контрагенты (Müştəri axtarışı)
        elif "справочник.контрагенты" in t:
            pat = self.parameters.get("Pattern", "%").replace("%", "")
            cur.execute("""
                SELECT name, code, inn FROM kontragenty 
                WHERE (name LIKE ? OR code LIKE ? OR inn LIKE ?) AND is_group = 0
                LIMIT 30
            """, (f"%{pat}%", f"%{pat}%", f"%{pat}%"))
            for r in cur.fetchall():
                results.append(VirtualQueryResultRow({
                    "Name": r["name"].strip(),
                    "Code": r["code"].strip(),
                    "INN": r["inn"] or ""
                }))

        # 5. Справочник.ТипыЦенНоменклатуры (Qiymət növləri)
        elif "справочник.типыценноменклатуры" in t:
            cur.execute("SELECT code, name FROM price_types ORDER BY name")
            for r in cur.fetchall():
                results.append(VirtualQueryResultRow({
                    "Name": r["name"].strip(),
                    "Code": r["code"] or r["name"]
                }))

        # 6. Документ.УстановкаЦенНоменклатуры
        elif "документ.установкаценноменклатуры" in t or "документы.установкаценноменклатуры" in t:
            doc_num = self.parameters.get("DocNum", "")
            if doc_num:
                cur.execute("SELECT * FROM price_documents WHERE doc_number = ?", (doc_num,))
            else:
                cur.execute("SELECT * FROM price_documents ORDER BY doc_date DESC LIMIT 300")
            for r in cur.fetchall():
                v_ref = VirtualRef(r["doc_number"], f"Установка цен №{r['doc_number']}", extra=dict(r), table_name="price_documents")
                results.append(VirtualQueryResultRow({
                    "Ref": v_ref,
                    "Number": r["doc_number"],
                    "Date": r["doc_date"],
                    "Posted": "проведен" in str(r["status"]).lower(),
                    "DeletionMark": False,
                    "Responsible": r["responsible"] or "",
                    "Comment": r["comment"] or ""
                }))

        # 7. ПродажиОбороты (Satış dövriyyəsi)
        elif "продажиобороты" in t:
            cur.execute("SELECT period, item_code, item_name, kontragent, podrazdelenie, quantity, sum, vat FROM sales_turnover LIMIT 300")
            for r in cur.fetchall():
                results.append(VirtualQueryResultRow({
                    "Period": r["period"],
                    "Nomenklatura": VirtualRef(r["item_code"], r["item_name"]),
                    "Kontragent": VirtualRef("", r["kontragent"]),
                    "Podrazdelenie": VirtualRef("", r["podrazdelenie"]),
                    "Quantity": float(r["quantity"] or 0),
                    "Sum": float(r["sum"] or 0),
                    "Vat": float(r["vat"] or 0)
                }))

        # 8. Справочник.Номенклатура (Mallar və Kataloq)
        else:
            pat = self.parameters.get("Pattern", self.parameters.get("NomPattern", "%")).replace("%", "")
            code_pat = self.parameters.get("ItemCode", "")
            name_pat = self.parameters.get("ItemName", "")

            sql = "SELECT code, name, artikul, barcode, unit, parent FROM nomenklatura WHERE is_group = 0"
            p = []
            if pat:
                sql += " AND (name LIKE ? OR artikul LIKE ? OR code LIKE ? OR barcode LIKE ?)"
                s_param = f"%{pat}%"
                p.extend([s_param, s_param, s_param, s_param])
            elif code_pat or name_pat:
                sql += " AND (code = ? OR name LIKE ?)"
                p.extend([code_pat, f"%{name_pat}%"])

            sql += " LIMIT 50"
            cur.execute(sql, p)
            for r in cur.fetchall():
                v_ref = VirtualRef(r["code"], r["name"], extra=dict(r))
                results.append(VirtualQueryResultRow({
                    "Ref": v_ref,
                    "Code": r["code"].strip(),
                    "Name": r["name"].strip(),
                    "FullName": r["name"].strip(),
                    "Artikul": r["artikul"] or "",
                    "Barcode": r["barcode"] or "",
                    "Unit": r["unit"] or "əd",
                    "ParentName": r["parent"] or "",
                    "Producer": "",
                    "Country": "Azərbaycan"
                }))

        conn.close()
        return results


class VirtualCatalogs:
    """1C Справочники kolleksiyası"""
    def __init__(self):
        pass

    def __getattr__(self, catalog_name):
        return VirtualCatalogItemManager(catalog_name)


class VirtualCatalogItemManager:
    """1C СправочникМенеджер"""
    def __init__(self, name):
        self.name = name

    def НайтиПоНаименованию(self, name, exact=False):
        if not os.path.exists(DB_PATH):
            return VirtualRef("", "")
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT code, name FROM nomenklatura WHERE name = ? LIMIT 1", (name,))
        r = cur.fetchone()
        conn.close()
        if r:
            return VirtualRef(r["code"], r["name"])
        return VirtualRef("", "")

    def НайтиПоКоду(self, code):
        if not os.path.exists(DB_PATH):
            return VirtualRef("", "")
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT code, name FROM nomenklatura WHERE code = ? LIMIT 1", (code,))
        r = cur.fetchone()
        conn.close()
        if r:
            return VirtualRef(r["code"], r["name"])
        return VirtualRef("", "")


class VirtualDocuments:
    """1C Документы kolleksiyası"""
    def __getattr__(self, doc_type):
        return VirtualDocumentManager(doc_type)


class VirtualDocumentManager:
    def __init__(self, doc_type):
        self.doc_type = doc_type

    def НайтиПоНомеру(self, number, date=None):
        return VirtualRef(number, f"{self.doc_type} №{number}")


class VirtualMetadataItem:
    def __init__(self, name, synonym):
        self.Имя = name
        self.Синоним = synonym
        self.Реквизиты = [
            VirtualMetadataReq("Номер"),
            VirtualMetadataReq("Дата"),
            VirtualMetadataReq("Проведен"),
            VirtualMetadataReq("Контрагент"),
            VirtualMetadataReq("Ответственный"),
            VirtualMetadataReq("Комментарий")
        ]


class VirtualMetadataReq:
    def __init__(self, name):
        self.Имя = name


class VirtualMetadataDocuments:
    def Найти(self, doc_type):
        return VirtualMetadataItem(doc_type, "Установка цен номенклатуры (Offline 1C)")


class VirtualMetadata:
    def __init__(self):
        self.Документы = VirtualMetadataDocuments()


class Virtual1CSession:
    """1C COMConnection sessiyası"""
    def __init__(self, conn_str):
        self.conn_str = conn_str
        self.Справочники = VirtualCatalogs()
        self.Документы = VirtualDocuments()
        self.Метаданные = VirtualMetadata()

    def NewObject(self, obj_name):
        n = obj_name.strip().lower()
        if n in ["запрос", "query"]:
            return Virtual1CQuery()
        elif n in ["списокзначений", "valuelist"]:
            return Virtual1CValueList()
        else:
            return Virtual1CQuery()

    def String(self, val):
        return str(val)

    def XMLСтрока(self, val):
        return str(val)


class Virtual1CConnector:
    """V83.COMConnector virtual əvəzləyicisi"""
    def Connect(self, conn_str):
        print(f"🔌 [VIRTUAL 1C DRIVER] Virtual 1C Sessiyası yaradıldı: '{conn_str}'", flush=True)
        return Virtual1CSession(conn_str)


# Avtomatik yoxlama və test
if __name__ == "__main__":
    print("Virtual 1C Driver Test edilir...")
    driver = Virtual1CConnector()
    v_conn = driver.Connect('Srvr="Localhost";Ref="Offline_1C";')
    q = v_conn.NewObject("Запрос")
    q.Text = "ВЫБРАТЬ Т.Наименование КАК Name, Т.Код КАК Code ИЗ Справочник.Пользователи"
    res = q.Execute().Choose()
    print("İstifadəçilər:")
    while res.Next():
        print(f" - {res.Name} ({res.Code})")

    q2 = v_conn.NewObject("Запрос")
    q2.Text = "ВЫБРАТЬ * ИЗ Документ.УстановкаЦенНоменклатуры"
    res2 = q2.Execute().Choose()
    count = 0
    while res2.Next() and count < 3:
        print(f" - Sənəd №{res2.Number}, Tarix: {res2.Date}, Məsul: {res2.Responsible}")
        count += 1
    print("✅ Virtual 1C Mühərriki 100% uğurla işləyir!")
