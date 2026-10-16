"""Project-local COM endpoint configuration, shared by API and standalone tools."""
import json
import os
from pathlib import Path


def resolve_port(root, explicit=None):
    value=explicit if explicit is not None else (os.environ.get('REPORTER_WORKER_PORT') or None)
    if value is None:
        path=Path(root)/'logs'/'worker-endpoint.json'
        try: value=json.loads(path.read_text(encoding='utf-8'))['port']
        except FileNotFoundError: value=5052
        except (ValueError,KeyError,TypeError) as error:
            raise ValueError('COM port tənzimləməsi düzgün deyil.') from error
    try: port=int(value)
    except (ValueError,TypeError) as error: raise ValueError('COM portu rəqəm olmalıdır.') from error
    if not 1024<=port<=65535: raise ValueError('COM portu 1024–65535 aralığında olmalıdır.')
    return port


def save_port(root,port):
    port=resolve_port(root,port)
    path=Path(root)/'logs'/'worker-endpoint.json'
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'port':port}),encoding='utf-8')
    os.replace(temporary,path)
