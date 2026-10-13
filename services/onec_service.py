"""API facade: API restart never owns or closes the persistent COM session."""
from services.onec_gateway import OneCGateway
one_c = OneCGateway()
service = one_c

def __getattr__(name):
    if name in ('OneCService', 'win32com', 'pythoncom', 'database'):
        from services import onec_worker
        return getattr(onec_worker, name)
    raise AttributeError(name)
