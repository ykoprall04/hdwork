"""Online SQLite backup + upgrade rehearsal on copies only. Never imports Courier main."""
import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import time
from pathlib import Path

def digest(file):
    h=hashlib.sha256()
    with open(file,'rb') as stream:
        for chunk in iter(lambda:stream.read(1048576),b''):h.update(chunk)
    return h.hexdigest()

def inspect_copy(file,bot_id):
    with sqlite3.connect(file.as_uri()+'?mode=ro',uri=True) as c:
        c.row_factory=sqlite3.Row
        if [row[0] for row in c.execute('PRAGMA integrity_check')]!=['ok']:raise ValueError('BACKUP_INTEGRITY_FAILED')
        meta=dict((r['key'],r['value']) for r in c.execute("SELECT key,value FROM metadata WHERE key IN ('bot_id','token_fingerprint','offset')"))
        if meta.get('bot_id')!=bot_id or not meta.get('token_fingerprint'):raise ValueError('JOURNAL_IDENTITY_MISMATCH')
        columns={r['name'] for r in c.execute('PRAGMA table_info(deliveries)')}
        needed={'seq','delivery_id','hash','success_id','ack','state','attempts','due'}
        if not needed<=columns:raise ValueError('JOURNAL_SCHEMA_NOT_COMPATIBLE')
        counts={r[0]:r[1] for r in c.execute('SELECT state,COUNT(*) FROM deliveries GROUP BY state')}
        updates={r[0]:r[1] for r in c.execute('SELECT state,COUNT(*) FROM updates GROUP BY state')}
        rows=c.execute("SELECT delivery_id,hash,success_id,ack,state,attempts FROM deliveries WHERE ack IS NOT NULL OR (state='SENDING' AND success_id IS NULL) ORDER BY seq LIMIT 1001").fetchall()
        if any(x not in ('SENDING','ACK_PENDING','SETTLED','ACK_REVIEW') for x in counts) or any(x not in ('PENDING','ACKED','IGNORED','QUARANTINED') for x in updates):raise ValueError('JOURNAL_LOGICAL_STATE_REVIEW_REQUIRED')
        pending=[]
        for row in rows[:1000]:
            ack=json.loads(row['ack']) if row['ack'] else {}
            result=ack.get('result',{})
            code=result.get('error_code')
            pending.append({'id':row['delivery_id'],'state':row['state'],'attempts':row['attempts'],'cachedSuccess':bool(row['success_id']), 'successDigest':hashlib.sha256(str(row['success_id']).encode()).hexdigest() if row['success_id'] else None,'ackPending':bool(row['ack']),'errorCode':code if code in ('NETWORK','UNKNOWN','RATE_LIMIT','FORBIDDEN','BAD_REQUEST','ECONNRESET','ETIMEDOUT') else None})
        # Compare only protocol invariants; never serialize message payload/customer bodies.
        invariant=(list(c.execute('SELECT update_id,hash,state,receipt FROM updates ORDER BY seq')),list(c.execute('SELECT delivery_id,hash,success_id,ack,state FROM deliveries ORDER BY seq')),meta.get('offset'))
        invariant=repr(([tuple(r) for r in invariant[0]],[tuple(r) for r in invariant[1]],invariant[2]))
        return {'integrity':'PASS','deliveryStates':counts,'inboxStates':updates,'pending':pending,'truncated':len(rows)>1000,'additiveUpgradeRequired':not {'last_result','last_lease_token','ack_since','ack_alert_at'}<=columns},meta,hashlib.sha256(invariant.encode()).hexdigest()

def prepare(source,destination,bot_id,timeout=120):
    source=Path(source);destination=Path(destination)
    if not source.is_absolute() or not source.is_file() or source.is_symlink() or source.stat().st_nlink!=1 or source.resolve()!=source.absolute():raise ValueError('EXISTING_REGULAR_JOURNAL_REQUIRED')
    if not destination.is_absolute() or destination.exists() or not destination.parent.is_dir() or destination.parent.resolve()!=destination.parent.absolute():raise ValueError('NEW_PRIVATE_BACKUP_REQUIRED')
    if source.parent==destination.parent or source.parent in destination.parents:raise ValueError('BACKUP_MUST_BE_OUTSIDE_SOURCE_JOURNAL')
    sidecars={}
    for suffix in ('-wal','-shm'):
        file=Path(str(source)+suffix)
        try:sidecars[suffix]={'exists':True,'bytes':file.stat().st_size}
        except FileNotFoundError:sidecars[suffix]={'exists':False,'bytes':0}
    if shutil.disk_usage(destination.parent).free<2*(source.stat().st_size+sidecars['-wal']['bytes'])+16777216:raise ValueError('BACKUP_DISK_SPACE_INSUFFICIENT')
    fd=os.open(str(destination),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.close(fd)
    start=time.monotonic()
    with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True,timeout=5) as src,sqlite3.connect(str(destination),timeout=5) as target:
        src.execute('PRAGMA query_only=ON')
        def progress(status,remaining,total):
            if time.monotonic()-start>timeout:raise TimeoutError('ONLINE_BACKUP_DEADLINE')
        src.backup(target,pages=128,progress=progress,sleep=.01)
        target.commit();target.execute('PRAGMA wal_checkpoint(TRUNCATE)');target.execute('PRAGMA journal_mode=DELETE')
    report,meta,before=inspect_copy(destination,bot_id)
    sha=digest(destination)
    upgraded=destination.with_name('journal-v2-rehearsal.sqlite3')
    if upgraded.exists():raise ValueError('NEW_REHEARSAL_COPY_REQUIRED')
    shutil.copyfile(destination,upgraded)
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'courier_bot'))
    from courier.journal import Journal
    journal=Journal(str(upgraded),bot_id,meta['token_fingerprint']);journal.close()
    _,_,after=inspect_copy(upgraded,bot_id)
    if before!=after or digest(destination)!=sha:raise ValueError('COPY_REHEARSAL_CHANGED_PROTOCOL_INVARIANTS')
    return {**report,'status':'COURIER_JOURNAL_BACKUP_VERIFIED','method':'SQLITE_ONLINE_BACKUP_WAL_FOLDED_INTO_STANDALONE_COPY','sourceOpenedReadOnly':True,'sourceCheckpointed':False,'liveWriterMayContinue':True,'sourceSidecars':sidecars,'backupSha256':sha,'rehearsalSha256':digest(upgraded),'rehearsalIntegrity':'PASS','protocolInvariantsPreserved':True,'productionJournalChanged':False}

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--destination',required=True);p.add_argument('--bot-id',required=True);args=p.parse_args()
    try:print(json.dumps(prepare(args.source,args.destination,args.bot_id)))
    except Exception as error:
        code=str(error) if isinstance(error,ValueError) else getattr(error,'sqlite_errorname',None) or 'JOURNAL_BACKUP_FAILED'
        print(json.dumps({'status':'JOURNAL_PREPARATION_FAILED','code':code,'productionJournalChanged':False}),file=sys.stderr);return 1
    return 0
if __name__=='__main__':sys.exit(main())
