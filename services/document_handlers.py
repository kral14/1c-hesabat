# -*- coding: utf-8 -*-
"""
services/document_handlers.py
Re-exports modular document handlers from services.documents package
for backwards compatibility with onec_service and other modules.
"""
from services.documents import (
    DOCUMENT_HANDLERS,
    handle_get_documents_list,
    handle_get_document_details,
    handle_get_price_document,
    handle_save_price_document,
    handle_get_all_price_types,
    handle_get_item_prices,
    handle_resolve_nomenclature_batch,
    handle_search_nomenclature,
    handle_find_pogruzka,
    format_1c_datetime,
    parse_query_datetime
)

__all__ = [
    "DOCUMENT_HANDLERS",
    "handle_get_documents_list",
    "handle_get_document_details",
    "handle_get_price_document",
    "handle_save_price_document",
    "handle_get_all_price_types",
    "handle_get_item_prices",
    "handle_resolve_nomenclature_batch",
    "handle_search_nomenclature",
    "handle_find_pogruzka",
    "format_1c_datetime",
    "parse_query_datetime"
]
