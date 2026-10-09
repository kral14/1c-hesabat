"""Password administration through the platform API, restricted to the test infobase."""

def require_test_admin(conn, payload):
    if (str(payload.get('server', '')).casefold(), str(payload.get('ref', '')).casefold()) != ('test1c', 'aztrade_test3'):
        raise ValueError('Изменение паролей доступно только в Test1C / Aztrade_test3')
    if payload.get('force_offline'):
        raise ValueError('Пароль базы 1C нельзя изменить в offline-режиме')
    try:
        has_admin = conn.ПравоДоступа('Администрирование', conn.Метаданные)
        print(f"[USER ADMIN] ПравоДоступа('Администрирование'): {has_admin}", flush=True)
    except Exception as e_adm:
        print(f"[USER ADMIN] Error checking ПравоДоступа: {e_adm}", flush=True)


def list_accounts(conn, payload, key, resp_q):
    require_test_admin(conn, payload)
    accounts = []
    try:
        ib_users = conn.ПользователиИнформационнойБазы.ПолучитьПользователей()
        print(f"[USER ADMIN] IB Users count: {ib_users.Количество()}", flush=True)
        for user in ib_users:
            accounts.append({'name': str(user.Имя), 'full_name': str(user.ПолноеИмя or ''),
                             'standard_auth': bool(user.АутентификацияСтандартная)})
        resp_q.put((True, {'accounts': accounts}))
    except Exception as e_ib:
        print(f"[USER ADMIN] Exception in ПользователиИнформационнойБазы: {e_ib}", flush=True)
        raise


def change_password(conn, payload, key, resp_q):
    require_test_admin(conn, payload)
    name = str(payload.get('target_user') or '').strip()
    password = payload.get('new_password')
    if not name or not isinstance(password, str) or not password:
        raise ValueError('Укажите учетную запись и новый пароль')
    if password != payload.get('confirm_password'):
        raise ValueError('Пароли не совпадают')
    user = conn.ПользователиИнформационнойБазы.НайтиПоИмени(name)
    if user is None or str(user.Имя) != name:
        raise ValueError('Учетная запись 1C не найдена')
    if not user.АутентификацияСтандартная:
        raise ValueError('Для этой учетной записи отключена аутентификация 1C. Изменять ее настройки нужно в администрировании 1C')
    current = conn.ПользователиИнформационнойБазы.ТекущийПользователь()
    user.Пароль = password
    user.Записать()
    resp_q.put((True, {'changed_user': name, 'changed_current_user': str(current.Имя) == name}))
