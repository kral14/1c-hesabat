const fs = require('fs');

let testCode = fs.readFileSync('tests/performance/journal_cache.test.cjs', 'utf8');
testCode = testCode.replace("static/js/universal_journal.js", "static/js/universal_journal_test.js");
fs.writeFileSync('tests/performance/journal_cache_test_run.cjs', testCode);
console.log("Written tests/performance/journal_cache_test_run.cjs");
