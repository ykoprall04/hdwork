"""Online read-only source; backup API folds WAL into a standalone new backup.
Outputs counts/checksums only. Restore destination must be new, never production.
"""
import hashlib, json, pathlib, sqlite3, sys
source, backup, restored = map(pathlib.Path, sys.argv[1:])
assert source.is_file() and not backup.exists() and not restored.exists()
assert len({p.resolve() for p in (source, backup, restored)}) == 3
def counts(c):
    names = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    return {n: c.execute('SELECT COUNT(*) FROM "' + n.replace('"', '""') + '"').fetchone()[0] for n in sorted(names)}
s = sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True, timeout=10)
s.execute('BEGIN')
before = counts(s)
d = sqlite3.connect(backup)
s.backup(d)
assert d.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
assert counts(d) == before
r = sqlite3.connect(restored)
d.backup(r)
assert r.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
after = counts(r)
assert after == before
r.close(); d.close(); s.close()
print(json.dumps({'rowCounts': before, 'restoredRowCounts': after, 'integrityVerified': True,
                  'sha256': hashlib.file_digest(backup.open('rb'), 'sha256').hexdigest()}))
