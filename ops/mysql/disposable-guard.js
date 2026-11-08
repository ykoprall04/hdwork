const path = require('node:path');
const fs = require('node:fs');
const denied = () => new Error('Disposable MySQL check rejected');
function config(env, argv) {
  if (argv.length !== 1 || argv[0] !== '--run-disposable' || env.HDWORK2_MYSQL_TEST_ENABLE !== 'DISPOSABLE_ONLY') throw denied();
  const database = env.HDWORK2_MYSQL_TEST_DATABASE, user = env.HDWORK2_MYSQL_TEST_USER;
  // Exact dedicated namespace; no operational schema, aliases or connection URLs.
  if (typeof database !== 'string' || !/^hdwork2_test_[a-f0-9]{16}$/.test(database)) throw denied();
  if (env.HDWORK2_MYSQL_TEST_HOST !== '127.0.0.1' || !/^[1-9]\d{0,4}$/.test(env.HDWORK2_MYSQL_TEST_PORT || '')) throw denied();
  const port = Number(env.HDWORK2_MYSQL_TEST_PORT);
  if (port === 3306 || port > 65535) throw denied();
  if (typeof user !== 'string' || !/^hdwork2_test_[a-z0-9_]{1,32}$/.test(user) || [env.DB_USER, env.B2C_STAGING_DB_USER, env.COURIER_DB_USER].includes(user)) throw denied();
  if (typeof env.HDWORK2_MYSQL_TEST_PASSWORD !== 'string' || !env.HDWORK2_MYSQL_TEST_PASSWORD) throw denied();
  return { host:'127.0.0.1',port,user,password:env.HDWORK2_MYSQL_TEST_PASSWORD,database,connectionLimit:3,connectTimeout:5000,multipleStatements:false,timezone:'Z',supportBigNumbers:true,bigNumberStrings:true };
}
function validateGrants(rows, database, literalDatabaseNames = false) {
  if (!Array.isArray(rows) || !rows.length) throw denied();
  let scoped = false;
  for (const row of rows) {
    const grant = Object.values(row)[0];
    if (typeof grant !== 'string' || /WITH GRANT OPTION|PROXY/i.test(grant)) throw denied();
    if (/^GRANT USAGE ON \*\.\* TO /i.test(grant)) continue;
    const grantDatabase = literalDatabaseNames ? database : database.replace(/_/g,'\\_');
    const prefix = ` ON \`${grantDatabase}\`.* TO `;
    if (!grant.startsWith('GRANT ') || !grant.includes(prefix)) throw denied();
    const permissions = grant.slice(6,grant.indexOf(prefix)).split(', ').map(s=>s.trim());
    if (!permissions.every(p=>['ALL PRIVILEGES','SELECT','INSERT','UPDATE','CREATE','ALTER','REFERENCES','INDEX'].includes(p))) throw denied();
    scoped = true;
  }
  if (!scoped) throw denied();
}
function migrationStatements() {
  const root = path.resolve(__dirname,'../../database/manual');
  return ['004_hdwork2_courier.sql','005_hdwork2_b2c_audit.sql','006_hdwork2_commands.sql'].flatMap(name=>{
    const sql=fs.readFileSync(path.join(root,name),'utf8').replace(/^\s*--.*$/gm,'');
    const statements=sql.split(';').map(s=>s.trim()).filter(Boolean);
    if (statements.shift() !== 'USE hdwork2') throw denied();
    if (!statements.length || statements.some(s=>!/^(CREATE TABLE hd2_[a-z_]+ \(|INSERT INTO hd2_order_statuses\(code,label\) VALUES|ALTER TABLE hd2_audit ADD COLUMN detail JSON NULL$|ALTER TABLE hd2_orders\s+ADD COLUMN command VARCHAR\(16\))/.test(s) || /\b(USE|DROP|TRUNCATE|GRANT|TRIGGER|PROCEDURE|DATABASE)\b/i.test(s) || /`|hdwork2\.|hd_b2c\./i.test(s))) throw denied();
    // Never execute the source USE directive: the connection stays in disposable DB.
    return statements;
  });
}
async function verifyTarget(connection, database) {
  const [[row]]=await connection.query('SELECT DATABASE() AS db, VERSION() AS version');
  const version=/^(8)\.(\d+)\.(\d+)/.exec(row?.version || '');
  if (row?.db!==database || !version || /mariadb/i.test(row.version) || (Number(version[2])===0 && Number(version[3])<13)) throw denied();
  const [variables]=await connection.query("SHOW VARIABLES LIKE 'partial_revokes'");
  const literalNames = variables.length===1 && variables[0].Value==='ON';
  const [grants]=await connection.query('SHOW GRANTS FOR CURRENT_USER');validateGrants(grants,database,literalNames);
  const [tables]=await connection.query('SHOW FULL TABLES');if(tables.length)throw denied();
}
module.exports={config,validateGrants,migrationStatements,verifyTarget};
