// Inert review template. No tasks/services/PM2 daemon are created by import.
const path = require('node:path');
const home = process.env.PM2_HOME, logs = process.env.HDWORK2_LOG_DIR, python = process.env.COURIER_PYTHON_EXE;
if (!home || !path.win32.isAbsolute(home) || path.win32.basename(home).toLowerCase() !== 'hdwork2-pm2' ||
    !logs || !path.win32.isAbsolute(logs) || !python || !path.win32.isAbsolute(python)) throw Error('Separate private Windows paths required');
const root = path.resolve(__dirname, '../..');
const common = { cwd: root, instances: 1, exec_mode: 'fork', watch: false, autorestart: true,
  min_uptime: 30000, max_restarts: 5, exp_backoff_restart_delay: 2000, kill_timeout: 90000,
  time: true, log_date_format: 'YYYY-MM-DD HH:mm:ss Z' };
module.exports = { apps: [
  { ...common, name: 'hdwork2-courier-backend', script: 'courier-b2c-server.js', args: '--run',
    node_args: '--max-old-space-size=160', max_memory_restart: '224M',
    out_file: path.win32.join(logs, 'courier-backend-out.log'), error_file: path.win32.join(logs, 'courier-backend-error.log') },
  { ...common, name: 'hdwork2-courier-bot', script: python, interpreter: 'none', args: ['-m', 'courier', '--run'],
    max_memory_restart: '160M', env: { PYTHONPATH: path.join(root, 'courier_bot') },
    out_file: path.win32.join(logs, 'courier-bot-out.log'), error_file: path.win32.join(logs, 'courier-bot-error.log') }
] };
// Flags and secrets come only from the private launch environment. All default off.
