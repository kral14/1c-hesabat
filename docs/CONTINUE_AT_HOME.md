# Continue at home

Agent filters implemented; live verification on the test database remains:
- Agent > Вид реализации, selected from Виды реализации (CAT, GR, OPT, PS, RG, TOP, VS, VS JDE).
- Agent > Группа реализации, selected from Группы реализации (Region MT, Region TT, KK, Опт, Спецканал, TT Баку).
- Metadata reference types resolve scalar attributes and table sections at query time. Group table membership takes priority over the sales channel when available. Missing or ambiguous metadata produces an explicit error.

Journal edge pagination: boundary wheel handling and paging diagnostics added. Mocked paging 200 -> 400 -> 401 passed; live reproduction remains to verify.

COM manager: explicit confirmed restart button and process / connection start times added. Existing sessions must never be terminated automatically.

Live document tests must use Test1C / Aztrade_test3, not the main database. Do not terminate sessions without explicit authorization.

Optional direct contracts COM lookup reads REPORTER_CONTRACTS_COM_CONNECTION from the environment; no connection password is stored in source. Without it, the existing fallback remains in use.

Local database files, run_mode.json, temporary scripts and diagnostic outputs are intentionally excluded from this commit.
