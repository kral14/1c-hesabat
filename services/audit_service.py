# -*- coding: utf-8 -*-
"""
services/audit_service.py
1C:Enterprise Document Versioning & Change Audit Service.
Extracts document versions from РегистрСведений.ВерсииОбъектов and event log
to provide a complete audit trail of modifications, amounts, users, and line item diffs.
"""
import datetime
from services.documents.base import format_1c_datetime, parse_query_datetime


def get_audit_list(conn, payload):
    """
    Returns list of modified documents with version counts, last modified date, and last author.
    """
    doc_type_filter = payload.get("doc_type", "").strip()
    author_filter = payload.get("author", "").strip()
    search_str = payload.get("search", "").strip()
    date_from = payload.get("date_from")
    date_to = payload.get("date_to")
    limit_count = int(payload.get("limit") or 200)

    where_parts = []
    q = conn.NewObject("Запрос")

    # Document type restrictions
    if doc_type_filter == "РеализацияТоваровУслуг":
        where_parts.append("Т.Объект ССЫЛКА Документ.РеализацияТоваровУслуг")
    elif doc_type_filter in ["ПогрузкиМашин", "ПогрузкаМашин"]:
        where_parts.append("Т.Объект ССЫЛКА Документ.ПогрузкиМашин")
    elif doc_type_filter == "ВозвратТоваровОтПокупателя":
        where_parts.append("Т.Объект ССЫЛКА Документ.ВозвратТоваровОтПокупателя")
    else:
        where_parts.append(
            "(Т.Объект ССЫЛКА Документ.РеализацияТоваровУслуг "
            "ИЛИ Т.Объект ССЫЛКА Документ.ПогрузкиМашин "
            "ИЛИ Т.Объект ССЫЛКА Документ.ВозвратТоваровОтПокупателя)"
        )

    # Date range filters on ДатаВерсии
    if date_from:
        dt_f = parse_query_datetime(date_from, is_end=False)
        if dt_f:
            q.SetParameter("DateFrom", dt_f)
            where_parts.append("Т.ДатаВерсии >= &DateFrom")

    if date_to:
        dt_t = parse_query_datetime(date_to, is_end=True)
        if dt_t:
            q.SetParameter("DateTo", dt_t)
            where_parts.append("Т.ДатаВерсии <= &DateTo")

    if author_filter:
        q.SetParameter("AuthorLike", f"%{author_filter}%")
        where_parts.append("Т.АвторВерсии.Наименование ПОДОБНО &AuthorLike")

    where_sql = ("ГДЕ " + " И ".join(where_parts)) if where_parts else ""

    q.Text = f"""
    ВЫБРАТЬ
        Т.Объект КАК DocRef,
        МАКСИМУМ(Т.НомерВерсии) КАК MaxVersion,
        МАКСИМУМ(Т.ДатаВерсии) КАК LastDate,
        ПРЕДСТАВЛЕНИЕ(МАКСИМУМ(Т.АвторВерсии)) КАК LastAuthor,
        КОЛИЧЕСТВО(РАЗЛИЧНЫЕ Т.НомерВерсии) КАК VersionCount
    ИЗ
        РегистрСведений.ВерсииОбъектов КАК Т
    {where_sql}
    СГРУППИРОВАТЬ ПО
        Т.Объект
    УПОРЯДОЧИТЬ ПО
        LastDate УБЫВ
    """

    res = q.Execute().Choose()
    items = []
    
    while res.Next():
        doc_ref = res.DocRef
        if not doc_ref:
            continue

        ref_str = conn.String(doc_ref)
        last_date_str = format_1c_datetime(res.LastDate)
        last_author = str(res.LastAuthor or "").strip()
        version_count = int(res.VersionCount or res.MaxVersion or 1)

        # Inspect document header from reference
        doc_num = ""
        doc_date = ""
        kontr_name = ""
        amount = 0.0
        posted = False
        deleted = False
        doc_type_name = "Документ"

        try:
            meta = doc_ref.Метаданные()
            doc_type_name = str(meta.Имя)
            doc_num = str(getattr(doc_ref, "Номер", "") or "").strip()
            doc_date = format_1c_datetime(getattr(doc_ref, "Дата", None))
            posted = bool(getattr(doc_ref, "Проведен", False))
            deleted = bool(getattr(doc_ref, "ПометкаУдаления", False))

            if hasattr(doc_ref, "Контрагент"):
                k_obj = doc_ref.Контрагент
                if k_obj:
                    kontr_name = str(getattr(k_obj, "Наименование", "") or "").strip()
            elif hasattr(doc_ref, "Водитель"):
                v_obj = doc_ref.Водитель
                if v_obj:
                    kontr_name = f"Водитель: {str(getattr(v_obj, 'Наименование', '') or '').strip()}"

            if hasattr(doc_ref, "СуммаДокумента"):
                amount = float(getattr(doc_ref, "СуммаДокумента", 0) or 0)
        except Exception:
            pass

        # Text search matching
        if search_str:
            s_low = search_str.lower()
            combined = f"{doc_num} {doc_type_name} {kontr_name} {last_author} {ref_str}".lower()
            if s_low not in combined:
                continue

        # Human friendly doc type title
        type_title_map = {
            "РеализацияТоваровУслуг": "Реализация товаров и услуг",
            "ПогрузкиМашин": "Погрузка машин",
            "ВозвратТоваровОтПокупателя": "Возврат товаров от покупателя"
        }
        friendly_title = type_title_map.get(doc_type_name, doc_type_name)

        items.append({
            "doc_ref_str": ref_str,
            "doc_type": doc_type_name,
            "doc_type_title": friendly_title,
            "number": doc_num,
            "date": doc_date,
            "kontragent": kontr_name,
            "amount": amount,
            "posted": posted,
            "deleted": deleted,
            "last_version": int(res.MaxVersion or version_count),
            "version_count": version_count,
            "last_date": last_date_str,
            "last_author": last_author or "Не указан",
            "last_operation": "Изменение" if version_count > 1 else "Создание"
        })

        if limit_count > 0 and len(items) >= limit_count:
            break

    return {
        "items": items,
        "total_count": len(items),
        "period": {
            "date_from": date_from or "",
            "date_to": date_to or ""
        }
    }


def get_document_version_diff(conn, payload):
    """
    Returns full chronological version history and granular line-by-line diff
    for a specific document.
    """
    doc_type = payload.get("doc_type") or "РеализацияТоваровУслуг"
    doc_number = payload.get("number", "").strip()

    if not doc_number:
        raise ValueError("Номер документа не указан")

    clean_num = doc_number.replace("С", "C").replace("с", "c")
    alt_num = clean_num.replace("C", "С")

    # 1. Locate Document Reference
    q_find = conn.NewObject("Запрос")
    q_find.SetParameter("DocNum", clean_num)
    q_find.SetParameter("AltDocNum", alt_num)
    q_find.SetParameter("DocNumLike", f"%{clean_num}%")

    if doc_type == "ПогрузкиМашин":
        from_table = "Документ.ПогрузкиМашин"
    elif doc_type == "ВозвратТоваровОтПокупателя":
        from_table = "Документ.ВозвратТоваровОтПокупателя"
    else:
        from_table = "Документ.РеализацияТоваровУслуг"

    q_find.Text = f"""
    ВЫБРАТЬ ПЕРВЫЕ 1
        Т.Ссылка КАК Ref,
        Т.Номер КАК Number,
        Т.Дата КАК Date,
        Т.Проведен КАК Posted,
        Т.ПометкаУдаления КАК DeletionMark
    ИЗ
        {from_table} КАК Т
    ГДЕ
        Т.Номер = &DocNum
        ИЛИ Т.Номер = &AltDocNum
        ИЛИ Т.Номер ПОДОБНО &DocNumLike
    """
    res_find = q_find.Execute().Choose()
    if not res_find.Next():
        raise ValueError(f"Документ {doc_type} №{doc_number} не найден в 1С")

    doc_ref = res_find.Ref
    current_doc_num = str(res_find.Number or doc_number).strip()
    current_doc_date = format_1c_datetime(res_find.Date)

    # 2. Query all versions from РегистрСведений.ВерсииОбъектов
    q_ver = conn.NewObject("Запрос")
    q_ver.SetParameter("DocRef", doc_ref)
    q_ver.Text = """
    ВЫБРАТЬ
        Т.НомерВерсии КАК VersionNum,
        Т.ДатаВерсии КАК VersionDate,
        Т.АвторВерсии.Наименование КАК Author,
        Т.ВерсияОбъекта КАК Storage
    ИЗ
        РегистрСведений.ВерсииОбъектов КАК Т
    ГДЕ
        Т.Объект = &DocRef
    УПОРЯДОЧИТЬ ПО
        Т.НомерВерсии ВОЗР
    """
    res_ver = q_ver.Execute().Choose()

    parsed_versions = []
    while res_ver.Next():
        v_num = int(res_ver.VersionNum or 0)
        v_author = str(res_ver.Author or "").strip() or "Пользователь 1С"
        v_date = format_1c_datetime(res_ver.VersionDate)

        obj_snap = None
        try:
            obj_snap = res_ver.Storage.Получить()
        except Exception as e_snap:
            print(f"Error unpacking version {v_num}:", e_snap)

        if not obj_snap:
            continue

        # Extract snapshot fields
        v_amt = float(getattr(obj_snap, "СуммаДокумента", 0) or 0)
        v_posted = bool(getattr(obj_snap, "Проведен", False))
        v_deleted = bool(getattr(obj_snap, "ПометкаУдаления", False))
        v_comment = str(getattr(obj_snap, "Комментарий", "") or "").strip()

        v_kontr = ""
        if hasattr(obj_snap, "Контрагент") and obj_snap.Контрагент:
            v_kontr = str(getattr(obj_snap.Контрагент, "Наименование", "") or "").strip()

        v_wh = ""
        if hasattr(obj_snap, "Склад") and obj_snap.Склад:
            v_wh = str(getattr(obj_snap.Склад, "Наименование", "") or "").strip()

        v_driver = ""
        if hasattr(obj_snap, "Водитель") and obj_snap.Водитель:
            v_driver = str(getattr(obj_snap.Водитель, "Наименование", "") or "").strip()

        v_route = str(getattr(obj_snap, "Маршрут", "") or "").strip()

        # Extract snapshot table items
        items = []
        if hasattr(obj_snap, "Товары"):
            for row in obj_snap.Товары:
                nom = getattr(row, "Номенклатура", None)
                nom_name = str(getattr(nom, "Наименование", "") or "").strip() if nom else ""
                nom_code = str(getattr(nom, "Код", "") or "").strip() if nom else ""
                nom_art = str(getattr(nom, "Артикул", "") or "").strip() if nom else ""
                qty = float(getattr(row, "Количество", 0) or 0)
                price = float(getattr(row, "Цена", 0) or 0)
                total = float(getattr(row, "Сумма", 0) or 0)
                items.append({
                    "code": nom_code,
                    "article": nom_art,
                    "name": nom_name,
                    "qty": qty,
                    "price": price,
                    "total": total
                })
        elif hasattr(obj_snap, "СписокРеализаций"):
            for row in obj_snap.СписокРеализаций:
                nakl = getattr(row, "Накладная", None)
                n_num = str(getattr(nakl, "Номер", "") or "").strip() if nakl else ""
                n_date = format_1c_datetime(getattr(nakl, "Дата", None)) if nakl else ""
                n_sum = float(getattr(nakl, "СуммаДокумента", 0) or 0) if nakl else 0.0
                k_name = ""
                if nakl and hasattr(nakl, "Контрагент") and nakl.Контрагент:
                    k_name = str(getattr(nakl.Контрагент, "Наименование", "") or "").strip()
                items.append({
                    "code": n_num,
                    "article": n_date,
                    "name": f"Реализация №{n_num} ({k_name})",
                    "qty": 1,
                    "price": n_sum,
                    "total": n_sum
                })

        parsed_versions.append({
            "version": v_num,
            "author": v_author,
            "date": v_date,
            "amount": v_amt,
            "posted": v_posted,
            "deleted": v_deleted,
            "comment": v_comment,
            "kontragent": v_kontr,
            "warehouse": v_wh,
            "driver": v_driver,
            "route": v_route,
            "items_count": len(items),
            "items": items
        })

    # 3. Calculate Diffs between each consecutive version (v1 -> v2, v2 -> v3...)
    version_diffs = []
    for i in range(len(parsed_versions)):
        cur_v = parsed_versions[i]
        prev_v = parsed_versions[i - 1] if i > 0 else None

        field_diffs = []
        item_diffs = {"added": [], "removed": [], "modified": []}

        if prev_v is None:
            # First Version (Creation)
            operation = "Создание документа"
            field_diffs.append({"field": "СуммаДокумента", "label": "Сумма", "old_val": "-", "new_val": f"{cur_v['amount']:.2f} AZN"})
            if cur_v.get("warehouse"):
                field_diffs.append({"field": "Склад", "label": "Склад", "old_val": "-", "new_val": cur_v["warehouse"]})
            if cur_v.get("comment"):
                field_diffs.append({"field": "Комментарий", "label": "Комментарий", "old_val": "-", "new_val": cur_v["comment"]})
        else:
            # Modification: Diff fields
            operation = "Изменение документа"
            if abs(cur_v["amount"] - prev_v["amount"]) > 0.001:
                field_diffs.append({
                    "field": "СуммаДокумента",
                    "label": "Сумма",
                    "old_val": f"{prev_v['amount']:.2f} AZN",
                    "new_val": f"{cur_v['amount']:.2f} AZN",
                    "diff": cur_v["amount"] - prev_v["amount"]
                })
            if cur_v["posted"] != prev_v["posted"]:
                operation = "Проведение" if cur_v["posted"] else "Отмена проведения"
                field_diffs.append({
                    "field": "Проведен",
                    "label": "Статус проведения",
                    "old_val": "Проведен" if prev_v["posted"] else "Не проведен",
                    "new_val": "Проведен" if cur_v["posted"] else "Не проведен"
                })
            if cur_v["deleted"] != prev_v["deleted"]:
                operation = "Пометка на удаление" if cur_v["deleted"] else "Снятие пометки на удаление"
                field_diffs.append({
                    "field": "ПометкаУдаления",
                    "label": "Пометка на удаление",
                    "old_val": "Да" if prev_v["deleted"] else "Нет",
                    "new_val": "Да" if cur_v["deleted"] else "Нет"
                })
            if cur_v["comment"] != prev_v["comment"]:
                field_diffs.append({
                    "field": "Комментарий",
                    "label": "Комментарий",
                    "old_val": prev_v["comment"] or "—",
                    "new_val": cur_v["comment"] or "—"
                })
            if cur_v["warehouse"] != prev_v["warehouse"]:
                field_diffs.append({
                    "field": "Склад",
                    "label": "Склад",
                    "old_val": prev_v["warehouse"] or "—",
                    "new_val": cur_v["warehouse"] or "—"
                })

            # Diff line items
            old_map = {it["code"] or it["name"]: it for it in prev_v["items"]}
            new_map = {it["code"] or it["name"]: it for it in cur_v["items"]}

            for key, new_item in new_map.items():
                if key not in old_map:
                    item_diffs["added"].append(new_item)
                else:
                    old_item = old_map[key]
                    qty_diff = abs(new_item["qty"] - old_item["qty"]) > 0.0001
                    price_diff = abs(new_item["price"] - old_item["price"]) > 0.001
                    sum_diff = abs(new_item["total"] - old_item["total"]) > 0.001
                    if qty_diff or price_diff or sum_diff:
                        item_diffs["modified"].append({
                            "name": new_item["name"],
                            "code": new_item["code"],
                            "old_qty": old_item["qty"],
                            "new_qty": new_item["qty"],
                            "old_price": old_item["price"],
                            "new_price": new_item["price"],
                            "old_total": old_item["total"],
                            "new_total": new_item["total"]
                        })

            for key, old_item in old_map.items():
                if key not in new_map:
                    item_diffs["removed"].append(old_item)

        version_diffs.append({
            "version": cur_v["version"],
            "author": cur_v["author"],
            "date": cur_v["date"],
            "operation": operation,
            "amount": cur_v["amount"],
            "posted": cur_v["posted"],
            "deleted": cur_v["deleted"],
            "field_diffs": field_diffs,
            "item_diffs": item_diffs,
            "total_items": cur_v["items_count"]
        })

    # 4. Also fetch Event Log timeline for who posted/unposted/saved
    event_timeline = []
    try:
        tz = conn.NewObject("ТаблицаЗначений")
        filt = conn.NewObject("Структура")
        filt.Вставить("Данные", doc_ref)
        conn.ВыгрузитьЖурналРегистрации(tz, filt, "", "", 30)
        for idx in range(tz.Количество()):
            row = tz.Получить(idx)
            ev_name = str(row.Событие or "")
            ev_user = str(row.ИмяПользователя or "Пользователь 1С").strip()
            ev_date = format_1c_datetime(row.Дата)
            ev_comment = str(row.Комментарий or "").strip()

            op_title = "Действие с документом"
            if "_$Data$_.Post" in ev_name:
                op_title = "✔ Проведение документа (Утвердил)"
            elif "_$Data$_.Unpost" in ev_name:
                op_title = "Отмена проведения (Снял утверждение)"
            elif "_$Data$_.New" in ev_name:
                op_title = "Создание документа"
            elif "_$Data$_.Update" in ev_name:
                op_title = "Изменение реквизитов"
            elif "_$Data$_.Delete" in ev_name:
                op_title = "✕ Пометка на удаление"

            event_timeline.append({
                "date": ev_date,
                "user": ev_user,
                "event": ev_name,
                "title": op_title,
                "comment": ev_comment
            })
    except Exception as e_log:
        print("Event log query skipped:", e_log)

    return {
        "doc_type": doc_type,
        "number": current_doc_num,
        "date": current_doc_date,
        "total_versions": len(parsed_versions),
        "versions": version_diffs,
        "raw_versions": parsed_versions,
        "event_timeline": event_timeline
    }
