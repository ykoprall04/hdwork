"""Online read-only source; backup API folds WAL into a standalone new backup.
Outputs counts/checksums only. Restore destination must be new, never production.
"""
import hashlib, json, pathlib, sqlite3, sys
def logical(c):
    h = hashlib.sha256()
    h.update(json.dumps(c.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").fetchall()).encode())
    for name, sql in c.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").fetchall():
        h.update(json.dumps([name,sql], sort_keys=True).encode())
        quoted = '"' + name.replace('"','""') + '"'
        columns = [r[1] for r in c.execute('PRAGMA table_info('+quoted+')')]
        order = ','.join('"'+n.replace('"','""')+'"' for n in columns)
        for row in c.execute('SELECT * FROM '+quoted+' ORDER BY '+order):
            h.update(json.dumps(row,default=lambda b:{'bytes':b.hex()},separators=(',',':')).encode())
            h.update(b'\n')
    return h.hexdigest()
def inspect(file):
    with sqlite3.connect(file.resolve().as_uri()+'?mode=ro',uri=True,timeout=10) as c:
        c.execute('PRAGMA query_only=ON');c.execute('BEGIN')
        assert c.execute('PRAGMA integrity_check').fetchall()==[('ok',)]
        return logical(c)
if sys.argv[1]=='--inspect-readonly':
    print(json.dumps({'logicalDigest':inspect(pathlib.Path(sys.argv[2]))}));sys.exit(0)
source, backup, restored = map(pathlib.Path, sys.argv[1:])
assert source.is_file() and not backup.exists() and not restored.exists()
assert len({p.resolve() for p in (source, backup, restored)}) == 3
def counts(c):
    names = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    return {n: c.execute('SELECT COUNT(*) FROM "' + n.replace('"', '""') + '"').fetchone()[0] for n in sorted(names)}
s = sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True, timeout=10)
s.execute('PRAGMA query_only=ON')
s.execute('BEGIN')
before = counts(s)
digest = logical(s)
d = sqlite3.connect(backup)
s.backup(d)
assert d.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
assert counts(d) == before
assert logical(d) == digest
r = sqlite3.connect(restored)
d.backup(r)
assert r.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
after = counts(r)
assert after == before
assert logical(r) == digest
r.close(); d.close(); s.close()
assert inspect(source) == digest
print(json.dumps({'rowCounts': before, 'restoredRowCounts': after, 'integrityVerified': True,
                  'logicalDigest':digest,
                  'sha256': hashlib.file_digest(backup.open('rb'), 'sha256').hexdigest()}))
