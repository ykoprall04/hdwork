const mysql = require("mysql2/promise");
if(['root','mysql.sys','mysql.session'].includes((process.env.DB_USER||'').toLowerCase()) ||
 (process.env.HDWORK2_AUTH_V2==='true'&&(process.env.DB_USER!=='hdwork_auth'||process.env.DB_NAME!=='hdwork2'||process.env.DB_HOST!=='127.0.0.1'||String(process.env.DB_PORT)!=='3306')))throw Error('Auth database target rejected');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 2,
  connectTimeout: 5000,
  queueLimit: 20,
  multipleStatements:false,
  timezone:'Z',
});

module.exports = pool;
