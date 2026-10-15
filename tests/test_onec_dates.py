import datetime as dt
import unittest
from services.onec_dates import as_1c_date, parse_calendar_date, calendar_period, CalendarConnection
from services.documents.generic import get_generic_documents_list
from tests.documents.test_order_journal_fields import Connection


class OneCDateTests(unittest.TestCase):
    def test_wall_clock_fields_survive_utc_marshalling(self):
        for offset in (None, 4, -5, 9):
            for hour in (0, 23):
                zone = None if offset is None else dt.timezone(dt.timedelta(hours=offset))
                value = dt.datetime(2026, 10, 12, hour, 59, 59, tzinfo=zone)
                transmitted = as_1c_date(value).astimezone(dt.timezone.utc)
                self.assertEqual(transmitted.replace(tzinfo=None), value.replace(tzinfo=None))

    def test_midnight_range_reaches_query_without_local_time_shift(self):
        conn = Connection()
        get_generic_documents_list(conn, {'doc_type':'ЗаказПокупателя', 'date_from':'12.10.2026', 'date_to':'13.10.2026'})
        self.assertEqual(conn.query.parameters['DateFrom'], dt.datetime(2026,10,12,tzinfo=dt.timezone.utc))
        self.assertEqual(conn.query.parameters['DateTo'], dt.datetime(2026,10,13,23,59,59,tzinfo=dt.timezone.utc))

    def test_other_parameters_are_unchanged(self):
        self.assertEqual(as_1c_date('test'), 'test')
        self.assertIsNone(as_1c_date(None))

    def test_formats_boundaries_and_invalid_dates(self):
        for value in ('12.10.2026', '2026-10-12', '12/10/2026', '2026/10/12'):
            self.assertEqual(parse_calendar_date(value), dt.datetime(2026,10,12))
            self.assertEqual(parse_calendar_date(value, True), dt.datetime(2026,10,12,23,59,59))
        self.assertEqual(parse_calendar_date('12.10.2026 15:32',True),dt.datetime(2026,10,12,15,32,59))
        self.assertEqual(calendar_period('31.12.2026','01.01.2027')[1],dt.datetime(2027,1,1,23,59,59))
        for invalid in ('31.02.2026','not a date','2026-10-12T00:00:00Z'):
            with self.assertRaises(ValueError):parse_calendar_date(invalid)
        with self.assertRaises(ValueError):calendar_period('13.10.2026','12.10.2026')

    def test_com_boundary_catches_an_unconverted_future_query(self):
        class Query:
            def SetParameter(self, key, value):self.value=value.astimezone(dt.timezone.utc)
        class Conn:
            def NewObject(self, kind):return Query() if kind=='Запрос' else self
        conn=Conn();wrapped=CalendarConnection(conn)
        query=wrapped.NewObject('Запрос')
        query.Text='query text'
        value=dt.datetime(2026,10,12,tzinfo=dt.timezone(dt.timedelta(hours=4)))
        query.SetParameter('DateFrom',value)
        self.assertEqual(query.value,dt.datetime(2026,10,12,tzinfo=dt.timezone.utc))
        self.assertEqual(query.Text,'query text')
        self.assertIs(wrapped.NewObject('Массив'),conn)


if __name__ == '__main__': unittest.main()
