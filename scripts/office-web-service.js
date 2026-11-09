
'use strict';

// Task Scheduler entry point.
// DPAPI plaintext is received through owned stdin only.

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

const folder = 'C:/ProgramData/HDWork2/web';

function validateBundle(value) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'authPassword,readPassword,signingSecret' ||
    ['authPassword', 'readPassword', 'signingSecret'].some(
      k => typeof value[k] !== 'string' || !value[k]
    ) ||
    Buffer.byteLength(value.signingSecret) < 32
  ) {
    throw Error('Invalid service secret bundle');
  }

  return value;
}

// Supports an additional writer password only when
// the explicitly approved operational profile is selected.
// The legacy three-secret bundle remains unchanged.

function validateOperationalBundle(value, env) {
  if (env.HDWORK2_SERVICE_AUTH_POLICY !== 'operational-write') {
    return validateBundle(value);
  }

  const required = [
    'authPassword',
    'readPassword',
    'signingSecret',
    'writePassword'
  ];

  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !==
      [...required].sort().join(',')
  ) {
    throw Error('Operational bundle rejected');
  }

  validateBundle({
    authPassword: value.authPassword,
    readPassword: value.readPassword,
    signingSecret: value.signingSecret
  });

  if (
    typeof value.writePassword !== 'string' ||
    value.writePassword.length === 0
  ) {
    throw Error('Operational writer secret rejected');
  }

  return value;
}

function bootstrap(
  stream,
  { timeoutMs = 15000, validate = validateBundle } = {}
) {
  return new Promise((resolve, reject) => {
    stream.setEncoding('utf8');

    let text = '';

    const timer = setTimeout(
      () => done(Error('Bootstrap timeout')),
      timeoutMs
    );

    function cleanup() {
      clearTimeout(timer);
      stream.removeListener('data', data);
      stream.removeListener('end', ended);
      stream.removeListener('error', done);
    }

    function done(error, value) {
      cleanup();
      text = '';
      error ? reject(error) : resolve(value);
    }

    function ended() {
      done(Error('Bootstrap EOF'));
    }

    function data(b) {
      text += b.toString('utf8');

      if (Buffer.byteLength(text) > 16384) {
        return done(Error('Bootstrap oversized'));
      }

      const end = text.indexOf('\n');

      if (end >= 0) {
        try {
          done(
            null,
            validate(JSON.parse(text.slice(0, end)))
          );
        } catch {
          done(Error('Bootstrap rejected'));
        }
      }
    }

    stream.on('data', data);
    stream.once('end', ended);
    stream.once('error', done);
  });
}

async function run() {
  const env = JSON.parse(
    fs.readFileSync(
      path.join(folder, 'environment.json'),
      'utf8'
    )
  );

  if (
    env.HDWORK2_PUBLIC_ORIGIN !==
      'https://hdwork2.yoloo.space' ||
    env.HDWORK2_EDGE_AUTH_MODE !== 'application-session'
  ) {
    throw Error('Service origin rejected');
  }

  require('../src/config/persistent-auth')
    .validatePersistentAuth(env);

  for (const k of Object.keys(process.env)) {
    if (
      /^(HDWORK2_|DB_|OP_READ_|OP_WRITE_|COURIER_|B2C_|JWT_SECRET|LOCAL_WEB_DIST|FRONTEND_ORIGIN)/.test(k)
    ) {
      delete process.env[k];
    }
  }

  Object.assign(process.env, env);

  const secrets = await bootstrap(process.stdin, {
    validate: value => validateOperationalBundle(value, env)
  });

  let app;
  let control;
  let closing = false;
  let pool;

  const save = status =>
    fs.writeFileSync(
      path.join(folder, 'state.json'),
      JSON.stringify({
        status,
        pid: process.pid,
        origin: env.HDWORK2_PUBLIC_ORIGIN,
        readOnly: env.HDWORK2_LOCAL_READ_ONLY === 'true',
        courier: false,
        updatedAt: new Date().toISOString()
      })
    );

  const close = async () => {
    if (closing) return;

    closing = true;

    try {
      if (control?.listening) control.close();

      if (app) {
        await app.close();
      } else if (pool) {
        await pool.end();
      }

      await require('../src/config/operational-pools').close();
    } finally {
      save('STOPPED');
      process.stdin.destroy();
    }
  };

  let leaseEnded = false;

  process.stdin.once('end', () => {
    leaseEnded = true;
    if (app) void close();
  });

  try {
    Object.assign(process.env, {
      DB_PASSWORD: secrets.authPassword,
      JWT_SECRET: secrets.signingSecret
    });

    require('../src/config/api-only-startup')
      .validateApiOnlyConfig();

    pool = require('../src/config/database');

    require('../src/access/http').service();

    await require('../src/config/operational-pools')
      .initializeWithSecrets(async file => {
        if (file === env.OP_READ_DB_PASSWORD_DPAPI_FILE) {
          return secrets.readPassword;
        }

        if (
          env.HDWORK2_SERVICE_AUTH_POLICY ===
            'operational-write' &&
          file === env.OP_WRITE_DB_PASSWORD_DPAPI_FILE &&
          file !== env.OP_READ_DB_PASSWORD_DPAPI_FILE
        ) {
          return secrets.writePassword;
        }

        throw Error('Unexpected service secret request');
      });

    app = await require('../local-web-server')
      .startLocalWeb();

    control = net.createServer(socket => {
      let command = '';

      socket.setTimeout(3000, () => socket.destroy());

      socket.on('data', b => {
        command += b;

        if (command.length > 16) {
          socket.destroy();
        }
      });

      socket.once('end', () => {
        if (command === 'stop') void close();
      });
    });

    await new Promise((resolve, reject) => {
      control.once('error', reject);
      control.listen(
        '\\\\.\\pipe\\HDWork2WebControl',
        resolve
      );
    });

    if (leaseEnded) {
      await close();
      throw Error('Supervisor lease ended');
    }

    process.once('SIGINT', () => void close());
    process.once('SIGTERM', () => void close());

    save('READY');
  } catch {
    await close();
    throw Error('Service startup rejected');
  } finally {
    delete process.env.DB_PASSWORD;
    delete process.env.JWT_SECRET;

    for (const k of Object.keys(secrets)) {
      secrets[k] = '';
    }
  }
}

if (require.main === module) {
  run().catch(() => {
    console.error('HDWORK2_SERVICE_START_FAILED');
    process.exitCode = 1;
  });
}

module.exports = {
  validateBundle,
  validateOperationalBundle,
  bootstrap,
  run
};
