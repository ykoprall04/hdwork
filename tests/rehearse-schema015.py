"""Opt-in MySQL 8 integration rehearsal. Own isolated throwaway container only."""
import json
import os
import subprocess
import time
import uuid
from pathlib import Path

root=Path(__file__).resolve().parents[1]
environment={k:v for k,v in os.environ.items() if k not in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH')}
docker=['docker','--host=unix:///var/run/docker.sock']
name='hdwork-schema015-test-'+uuid.uuid4().hex

def run(args,sql=None,check=True):
    return subprocess.run(docker+args,input=sql,text=True,capture_output=True,env=environment,check=check,timeout=90)

def query(sql):
    return run(['exec','-i',name,'mysql','--batch','--skip-column-names','-uroot'],sql).stdout.strip()

try:
    run(['run','-d','--name',name,'--network','none','--tmpfs','/var/lib/mysql:rw','-e','MYSQL_ALLOW_EMPTY_PASSWORD=yes','mysql:8.0'])
    for _ in range(60):
        if run(['exec',name,'mysqladmin','ping','--silent'],check=False).returncode==0:break
        time.sleep(1)
    else:raise RuntimeError('TEMPORARY_MYSQL_NOT_READY')
    query('CREATE DATABASE hdwork2;\n'+(root/'database/manual/004_hdwork2_courier.sql').read_text())
    query((root/'database/manual/015_hdwork2_fifo_ack.review.sql').read_text())
    assert query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME='hd2_courier_outbox' AND COLUMN_NAME IN ('conversation_key','conversation_seq')")=='2'
    assert query("SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME='hd2_courier_outbox' AND INDEX_NAME='outbox_conversation_sequence'")=='bot_id,conversation_key,conversation_seq'
    assert query("SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='hdwork2' AND TABLE_NAME='hd2_courier_outbox' AND INDEX_NAME='outbox_conversation_head'")=='bot_id,conversation_key,conversation_seq,state'
    # Fixture messages only: no original routes, bodies, IDs or production credentials.
    query("""USE hdwork2;
INSERT INTO hd2_courier_outbox(id,bot_id,idem_key,payload_hash,payload,state,due_ms,conversation_key,conversation_seq) VALUES
('dead-first','fixture','one',REPEAT('a',64),'{}','DEAD',0,REPEAT('b',64),1),
('same-order-next','fixture','two',REPEAT('a',64),'{}','QUEUED',0,REPEAT('b',64),2),
('different-order','fixture','three',REPEAT('a',64),'{}','QUEUED',0,REPEAT('c',64),1);
""")
    predicate=subprocess.check_output(['node','-e',"process.stdout.write(require('./src/courier/fifo').predicate)"],cwd=root,text=True)
    eligible=query("USE hdwork2; SELECT id FROM hd2_courier_outbox WHERE bot_id='fixture' AND state='QUEUED'"+predicate)
    assert eligible=='different-order',eligible
    query("INSERT INTO hdwork2.hd2_courier_outbox(id,bot_id,idem_key,payload_hash,payload,state,due_ms) VALUES ('legacy-dead','fixture','four',REPEAT('a',64),'{}','DEAD',0)")
    assert query("SELECT COUNT(*) FROM hdwork2.hd2_courier_outbox WHERE bot_id='fixture' AND state<>'SENT' AND (conversation_key IS NULL OR conversation_seq IS NULL)")=='1'
    print(json.dumps({'status':'TEMPORARY_MYSQL_SCHEMA015_REHEARSAL_PASS','server':query('SELECT VERSION()'),
                      'migrationDependency':'004 outbox DDL','schemaAndIndexes':'PASS','deadPredecessorBlocksSameLane':'PASS',
                      'differentLaneEligible':'PASS','legacyDeadGateDetected':'PASS','productionAccessed':False,
                      'migrationSha256':__import__('hashlib').sha256((root/'database/manual/015_hdwork2_fifo_ack.review.sql').read_bytes()).hexdigest()}))
finally:
    # Only the uniquely named container created above; never a production database/service.
    run(['rm','-f',name],check=False)
