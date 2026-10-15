"""Preserve 1C calendar fields when pywin32 converts Python dates to VT_DATE.

1C dates have no time zone. pywin32 converts datetime values to UTC before
marshalling them. Tag wall-clock fields as UTC without shifting the fields;
this is a transport convention, not a change to the business time zone.
"""
import datetime
import re


def as_1c_date(value):
    if isinstance(value, datetime.datetime):
        return value.replace(tzinfo=datetime.timezone.utc)
    return value


def parse_calendar_date(value, is_end=False):
    """Parse a 1C wall-clock date; never infer the host's time zone."""
    if value is None or value == '':
        return None
    if isinstance(value, datetime.datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, datetime.date):
        return datetime.datetime.combine(value, datetime.time(23,59,59) if is_end else datetime.time())
    text = str(value).strip()
    match = re.fullmatch(r'(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?', text)
    if match:
        year, month, day, hour, minute, second = match.groups()
    else:
        match = re.fullmatch(r'(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?', text)
        if not match:
            raise ValueError(f'Tarix düzgün deyil: {text}')
        day, month, year, hour, minute, second = match.groups()
    return datetime.datetime(int(year), int(month), int(day),
        int(hour) if hour is not None else (23 if is_end else 0),
        int(minute) if minute is not None else (59 if is_end else 0),
        int(second) if second is not None else (59 if is_end else 0))


def calendar_period(start, end):
    first, last = parse_calendar_date(start), parse_calendar_date(end, True)
    if first is None or last is None:
        raise ValueError('Dövrün başlanğıc və son tarixini seçin.')
    if first > last:
        raise ValueError('Başlanğıc tarixi son tarixdən böyükdür.')
    return first, last


def format_calendar_date(value):
    if value is None or value == '':
        return ''
    if isinstance(value, datetime.datetime):
        return value.strftime('%d.%m.%Y %H:%M:%S')
    try:
        return parse_calendar_date(value).strftime('%d.%m.%Y %H:%M:%S')
    except (ValueError, TypeError):
        return str(value)[:19]


class CalendarQuery:
    """Enforce date transport even when a new caller forgets as_1c_date."""
    def __init__(self, query):
        object.__setattr__(self, '_query', query)
    def __getattr__(self, name): return getattr(self._query, name)
    def __setattr__(self, name, value): setattr(self._query, name, value)
    def SetParameter(self, name, value): return self._query.SetParameter(name, as_1c_date(value))
    def УстановитьПараметр(self, name, value): return self._query.УстановитьПараметр(name, as_1c_date(value))


class CalendarConnection:
    def __init__(self, connection): self.connection = connection
    def __getattr__(self, name): return getattr(self.connection, name)
    def NewObject(self, kind, *args):
        obj = self.connection.NewObject(kind, *(as_1c_date(value) for value in args))
        return CalendarQuery(obj) if kind in ('Запрос', 'Query') else obj
