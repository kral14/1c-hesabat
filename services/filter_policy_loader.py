"""Load document filter rules consistently in an existing COM worker.

Some document handlers are reloaded independently. A worker started before a
new policy API was added may still hold the older policy module in sys.modules.
Reload only that pure-Python module when the required API is absent; connections
and worker processes remain untouched.
"""
from importlib import import_module, reload


def current_filter_policy():
    policy = import_module('services.filter_policy')
    required = ('normalize_filters', 'validate_supported_fields', 'DOCUMENT_FIELDS', 'BASE_FIELDS')
    if any(not hasattr(policy, name) for name in required):
        policy = reload(policy)
    return policy


_policy = current_filter_policy()
normalize_filters = _policy.normalize_filters
validate_supported_fields = _policy.validate_supported_fields
DOCUMENT_FIELDS = _policy.DOCUMENT_FIELDS
BASE_FIELDS = _policy.BASE_FIELDS
