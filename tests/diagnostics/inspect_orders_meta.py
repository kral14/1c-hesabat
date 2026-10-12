import os
import sys
app_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, app_dir)
import database
from services.onec_service import one_c

active = database.get_active_base() or {}
print('Active base:', active.get('server'), active.get('ref'), active.get('user'))

script = """
has_doc = False
has_reg = False
try:
    _ = Метаданные.Документы.ЗаказПокупателя.Имя
    has_doc = True
except:
    pass

try:
    _ = Метаданные.РегистрыНакопления.ЗаказыПокупателей.Имя
    has_reg = True
except:
    pass

cols = Новый Массив;
Если has_doc Тогда
    Для Каждого Рекв Из Метаданные.Документы.ЗаказПокупателя.Реквизиты Цикл
        cols.Добавить(Рекв.Имя);
    КонецЦикла;
КонецЕсли;

tab_cols = Новый Массив;
Если has_doc Тогда
    Для Каждого ТЧ Из Метаданные.Документы.ЗаказПокупателя.ТабличныеЧасти Цикл
        tab_cols.Добавить("ТЧ: " + ТЧ.Имя);
        Для Каждого Рекв Из ТЧ.Реквизиты Цикл
            tab_cols.Добавить("  " + Рекв.Имя);
        КонецЦикла;
    КонецЦикла;
КонецЕсли;

reg_dims = Новый Массив;
Если has_reg Тогда
    Для Каждого Изм Из Метаданные.РегистрыНакопления.ЗаказыПокупателей.Измерения Цикл
        reg_dims.Добавить("Изм: " + Изм.Имя);
    КонецЦикла;
    Для Каждого Рес Из Метаданные.РегистрыНакопления.ЗаказыПокупателей.Ресурсы Цикл
        reg_dims.Добавить("Рес: " + Рес.Имя);
    КонецЦикла;
КонецЕсли;

res_str = "Doc: " + Строка(has_doc) + " | Reg: " + Строка(has_reg) + "\n";
res_str = res_str + "Реквизиты:\n" + СтрСоединить(cols, ", ") + "\n";
res_str = res_str + "Табличные части:\n" + СтрСоединить(tab_cols, "\n") + "\n";
res_str = res_str + "Регистр ЗаказыПокупателей:\n" + СтрСоединить(reg_dims, "\n");
Значение = res_str;
"""

try:
    res = one_c.execute("run_diagnostic_code", {"code": script})
    print("--- 1C METADATA RESULT ---")
    print(res.get("result"))
except Exception as e:
    print("Error:", e)
