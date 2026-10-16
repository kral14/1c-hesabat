"""Renew this project's standalone COM worker without launching run.py or Electron."""
import argparse
from datetime import datetime, timezone, timedelta


def display(state, output=print):
    def stamp(value):
        return datetime.fromtimestamp(value,timezone(timedelta(hours=4))).strftime('%d.%m.%Y %H:%M:%S') if value else 'məlum deyil'
    output(f"COM: {'işləyir' if state.get('available') else 'hazır deyil'} | PID: {state.get('pid') or '—'}")
    output('Prosesin başlama vaxtı: ' + stamp(state.get('process_started_at')))
    for connection in state.get('connections') or []:
        output(f"Baza: {connection.get('server')} / {connection.get('ref')} | İstifadəçi: {connection.get('user') or '—'}")
        output('Bağlantının başlama vaxtı: ' + stamp(connection.get('connected_at')))
    if state.get('busy'):
        output(f"İşləyən sorğu: {state.get('current_action') or '—'} ({int(state.get('action_age') or 0)} saniyə)")
    output(f"Növbədə: {state.get('queued') or 0}")


def main(argv=None, gateway=None, base_reader=None, output=print):
    parser = argparse.ArgumentParser(description='run.py-a toxunmadan lokal COM xidmətini yenilə.')
    parser.add_argument('--status',action='store_true',help='Yalnız vəziyyəti göstər; heç nə başlatma və bağlama.')
    parser.add_argument('--yes',action='store_true',help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        if gateway is None:
            from services.onec_gateway import OneCGateway
            gateway = OneCGateway()
        before = gateway.status(refresh=True)
        display(before,output)
        if args.status: return 0 if before.get('available') else 1
        if base_reader is None:
            import database
            base_reader = database.get_active_base
        active = base_reader() or {}
        if not active.get('server') or not active.get('ref'):
            raise ValueError('Saxlanmış aktiv baza yoxdur. Əvvəl proqramda bazanı seçin.')
        connections = before.get('connections') or []
        if len(connections) > 1:
            raise ValueError('Birdən çox bağlantı var. Yenilənməni COM idarəetmə pəncərəsindən edin.')
        if connections:
            current = connections[0]
            for field in ('server','ref'):
                if str(current.get(field) or '').strip().casefold() != str(active.get(field) or '').strip().casefold():
                    raise ValueError('Mövcud COM bazası saxlanmış aktiv bazadan fərqlidir. Səhv bazaya qoşulmamaq üçün əməliyyat dayandırıldı.')
            if active.get('user') and str(current.get('user') or '').strip().casefold() != str(active['user']).strip().casefold():
                raise ValueError('Mövcud COM istifadəçisi saxlanmış istifadəçidən fərqlidir. Əməliyyat dayandırıldı.')
        output(f"Yenidən qoşulacaq baza: {active['server']} / {active['ref']}")
        output('Bu proqramın COM prosesi və bağlantısı bağlanacaq; işləyən və növbədəki sorğular dayana bilər.')
        payload = {field:active[field] for field in ('server','ref','user','password') if field in active and active[field] is not None}
        output('COM yenilənir...')
        gateway.restart_worker(confirmed=True)
        gateway.execute('ping',payload,retry=0,timeout=60)
        after = gateway.status(refresh=True)
        if not after.get('available') or not after.get('session_count'):
            raise RuntimeError('COM yeniləndi, lakin bağlantı təsdiqlənmədi.')
        if before.get('available') and before.get('pid') == after.get('pid'):
            raise RuntimeError('COM prosesinin dəyişməsi təsdiqlənmədi.')
        output('COM yeniləndi və bağlantı hazırdır.')
        display(after,output)
        return 0
    except (KeyboardInterrupt,EOFError):
        output('Əməliyyat kəsildi.')
        return 130
    except Exception as error:
        # Never print connection strings, credentials or raw COM exception details.
        if isinstance(error, ValueError): output(str(error))
        else: output(f'COM yenilənməsi tamamlanmadı ({type(error).__name__}). COM idarəetmə pəncərəsində vəziyyəti yoxlayın.')
        return 1


if __name__ == '__main__':
    import sys
    for stream in (sys.stdout,sys.stderr):
        if hasattr(stream,'reconfigure'): stream.reconfigure(encoding='utf-8',errors='replace')
    raise SystemExit(main())
