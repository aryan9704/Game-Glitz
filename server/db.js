/**
 * GAMEGLITZ - Database adapter
 *
 * Supports:
 * - SQLite
 * - SQL Server
 * - Hybrid mode (primary DB for reads, mirrored writes to the secondary DB)
 */
const { AsyncLocalStorage } = require('async_hooks');
const sqlServer = require('./sqlserver');

let sql;
function getMssql() {
  if (!sql) {
    try {
      sql = require('mssql/msnodesqlv8');
    } catch {
      try {
        sql = require('mssql');
      } catch {
        throw new Error('SQL Server support requires "mssql". Run npm install in server.');
      }
    }
  }
  return sql;
}

const connectionContextStorage = new AsyncLocalStorage();
const VALID_DB_MODES = new Set(['sqlite', 'sqlserver', 'hybrid']);
const HYBRID_SYNC_TABLES = [
  'users',
  'sessions',
  'games',
  'game_genres',
  'game_platforms',
  'game_tags',
  'cart_items',
  'wishlist_items',
  'library',
  'orders',
  'order_items',
  'reviews',
  'groups',
  'group_members',
  'posts',
  'post_replies',
  'friends',
  'notifications',
  'audit_log',
  'support_tickets',
  'password_reset_tokens',
  'email_verification_tokens',
];
const AUTO_ID_TABLES = new Set([
  'cart_items',
  'wishlist_items',
  'library',
  'order_items',
  'reviews',
  'group_members',
  'friends',
  'audit_log',
]);

function normalizeDbMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return VALID_DB_MODES.has(mode) ? mode : '';
}

function getDbConfig() {
  const explicitMode = normalizeDbMode(process.env.DB_MODE);
  const mode = explicitMode || (process.env.USE_SQL_SERVER === 'true' ? 'sqlserver' : 'sqlite');

  let primary = mode;
  if (mode === 'hybrid') {
    const explicitPrimary = String(process.env.DB_PRIMARY || '').trim().toLowerCase();
    primary = explicitPrimary === 'sqlserver' ? 'sqlserver' : 'sqlite';
  }

  const secondary = mode === 'hybrid' ? (primary === 'sqlite' ? 'sqlserver' : 'sqlite') : null;

  return {
    mode,
    primary,
    secondary,
    usesSqlite: mode === 'sqlite' || mode === 'hybrid',
    usesSqlServer: mode === 'sqlserver' || mode === 'hybrid',
    syncOnStartup: mode === 'hybrid' && process.env.DB_SYNC_ON_STARTUP !== 'false',
  };
}

const dbConfig = getDbConfig();
const mirrorState = {
  status: dbConfig.mode === 'hybrid' ? 'pending' : 'disabled',
  lastSyncAt: null,
  lastErrorAt: null,
  lastError: null,
};

function getDbStatus() {
  return {
    ...dbConfig,
    mirror: dbConfig.mode === 'hybrid'
      ? {
          status: mirrorState.status,
          lastSyncAt: mirrorState.lastSyncAt,
          lastErrorAt: mirrorState.lastErrorAt,
          lastError: mirrorState.lastError,
        }
      : null,
  };
}

function recordMirrorSuccess() {
  if (dbConfig.mode !== 'hybrid') return;
  mirrorState.status = 'ok';
  mirrorState.lastSyncAt = new Date().toISOString();
  mirrorState.lastErrorAt = null;
  mirrorState.lastError = null;
}

function recordMirrorFailure(err, context) {
  if (dbConfig.mode !== 'hybrid') return;
  mirrorState.status = 'degraded';
  mirrorState.lastErrorAt = new Date().toISOString();
  mirrorState.lastError = `${context}: ${err.message}`;
  console.error(`[db] Mirror ${context} failed: ${err.message}`);
}

let sqliteDb = null;
function getSqliteDb() {
  if (!sqliteDb) {
    const { createDatabase } = require('./database');
    sqliteDb = createDatabase();
  }
  return sqliteDb;
}

function rewriteSqlServerQuery(sqlText) {
  let text = sqlText;
  let swapLastTwoParams = false;
  const ignoreUnique = /INSERT\s+OR\s+IGNORE\s+/i.test(text);

  text = text.replace(/INSERT OR IGNORE\s+/gi, 'INSERT ');
  text = text.replace(/datetime\((['"])now\1\)/gi, 'SYSUTCDATETIME()');

  const hasOrderBy = /ORDER\s+BY/i.test(text);

  if (/LIMIT\s+\?\s+OFFSET\s+\?/i.test(text)) {
    text = text.replace(
      /LIMIT\s+\?\s+OFFSET\s+\?/gi,
      hasOrderBy
        ? 'OFFSET ? ROWS FETCH NEXT ? ROWS ONLY'
        : 'ORDER BY (SELECT NULL) OFFSET ? ROWS FETCH NEXT ? ROWS ONLY'
    );
    swapLastTwoParams = true;
  }

  text = text.replace(
    /LIMIT\s+(\d+)\s*$/gi,
    hasOrderBy
      ? 'OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY'
      : 'ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY'
  );

  text = text.replace(
    /LIMIT\s+\?\s*$/gi,
    hasOrderBy
      ? 'OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY'
      : 'ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY'
  );

  return { text, swapLastTwoParams, ignoreUnique };
}

function getConnectionContext() {
  return connectionContextStorage.getStore() || null;
}

async function getSqlRequest(options = {}) {
  const context = options.context || getConnectionContext();
  if (context && context.sqlserver) return context.sqlserver.request();
  const pool = await sqlServer.getPool();
  return pool.request();
}

function isUniqueConstraintError(err) {
  return err && (err.number === 2627 || err.number === 2601);
}

async function executeSqlServer(sqlText, params = [], options = {}) {
  const { text: normalized, swapLastTwoParams, ignoreUnique } = rewriteSqlServerQuery(sqlText);

  let finalParams = params.map((value) => (value === undefined ? null : value));
  if (swapLastTwoParams && finalParams.length >= 2) {
    const copy = [...finalParams];
    const last = copy.pop();
    const secondLast = copy.pop();
    copy.push(last, secondLast);
    finalParams = copy;
  }

  const request = await getSqlRequest(options);

  try {
    if (finalParams.length > 0) {
      let index = 0;
      const namedSql = normalized.replace(/\?/g, () => `@gg_param_${++index}`);
      finalParams.forEach((value, idx) => request.input(`gg_param_${idx + 1}`, value));
      return await request.query(namedSql);
    }
    return await request.query(normalized);
  } catch (err) {
    if (ignoreUnique && isUniqueConstraintError(err)) return { recordset: [], rowsAffected: [0] };
    throw err;
  }
}

function wrapSqlServerStatement(sqlText, options = {}) {
  return {
    run: async (...params) => {
      const result = await executeSqlServer(sqlText, params, options);
      return { changes: result.rowsAffected.reduce((sum, value) => sum + value, 0) };
    },
    get: async (...params) => {
      const result = await executeSqlServer(sqlText, params, options);
      return result.recordset[0] || null;
    },
    all: async (...params) => {
      const result = await executeSqlServer(sqlText, params, options);
      return result.recordset;
    },
  };
}

function wrapSqliteStatement(sqlText) {
  const statement = getSqliteDb().prepare(sqlText);
  return {
    run: (...params) => statement.run(...params),
    get: (...params) => statement.get(...params),
    all: (...params) => statement.all(...params),
  };
}

function getStatementForBackend(backend, sqlText, options = {}) {
  return backend === 'sqlserver'
    ? wrapSqlServerStatement(sqlText, options)
    : wrapSqliteStatement(sqlText);
}

async function execOnBackend(backend, sqlText, options = {}) {
  if (backend === 'sqlserver') return executeSqlServer(sqlText, [], options);
  return getSqliteDb().exec(sqlText);
}

async function runOnBackend(backend, sqlText, params = [], options = {}) {
  return getStatementForBackend(backend, sqlText, options).run(...params);
}

async function allOnBackend(backend, sqlText, params = [], options = {}) {
  return getStatementForBackend(backend, sqlText, options).all(...params);
}

async function createSqlServerTransaction() {
  const pool = await sqlServer.getPool();
  const mssql = getMssql();
  const tx = new mssql.Transaction(pool);
  await tx.begin();
  return tx;
}

function quoteIdentifier(backend, name) {
  const value = String(name);
  if (backend === 'sqlserver') return `[${value.replace(/]/g, ']]')}]`;
  return `"${value.replace(/"/g, '""')}"`;
}

function qualifyTable(backend, table) {
  return backend === 'sqlserver'
    ? `dbo.${quoteIdentifier(backend, table)}`
    : quoteIdentifier(backend, table);
}

function normalizeSyncValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString().replace('T', ' ').replace('Z', '');
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return value;
}

function normalizeSyncRow(table, row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (AUTO_ID_TABLES.has(table) && key === 'id') continue;
    normalized[key] = normalizeSyncValue(value);
  }
  return normalized;
}

async function insertRow(backend, table, row) {
  const columns = Object.keys(row);
  if (columns.length === 0) return;

  const columnSql = columns.map((column) => quoteIdentifier(backend, column)).join(', ');
  const valuesSql = columns.map(() => '?').join(', ');
  const sqlText = `INSERT INTO ${qualifyTable(backend, table)} (${columnSql}) VALUES (${valuesSql})`;
  const values = columns.map((column) => row[column]);
  await runOnBackend(backend, sqlText, values);
}

async function syncMirrorFromPrimary(reason = 'startup') {
  if (dbConfig.mode !== 'hybrid') return;

  const source = dbConfig.primary;
  const target = dbConfig.secondary;
  const snapshot = new Map();

  for (const table of HYBRID_SYNC_TABLES) {
    const rows = await allOnBackend(source, `SELECT * FROM ${qualifyTable(source, table)}`);
    snapshot.set(table, rows);
  }

  for (const table of [...HYBRID_SYNC_TABLES].reverse()) {
    await runOnBackend(target, `DELETE FROM ${qualifyTable(target, table)}`);
  }

  for (const table of HYBRID_SYNC_TABLES) {
    const rows = snapshot.get(table) || [];
    for (const row of rows) {
      await insertRow(target, table, normalizeSyncRow(table, row));
    }
  }

  recordMirrorSuccess();
  console.log(`[db] Mirror sync complete (${source} -> ${target}, reason: ${reason})`);
}

function prepare(sqlText) {
  if (dbConfig.mode === 'sqlite') return wrapSqliteStatement(sqlText);
  if (dbConfig.mode === 'sqlserver') return wrapSqlServerStatement(sqlText);

  const primaryStatement = getStatementForBackend(dbConfig.primary, sqlText);
  const secondaryStatement = getStatementForBackend(dbConfig.secondary, sqlText);

  return {
    run: async (...params) => {
      const primaryResult = await primaryStatement.run(...params);
      try {
        await secondaryStatement.run(...params);
        recordMirrorSuccess();
      } catch (err) {
        recordMirrorFailure(err, 'write');
        if (getConnectionContext() && getConnectionContext().hybrid) throw err;
      }
      return primaryResult;
    },
    get: (...params) => primaryStatement.get(...params),
    all: (...params) => primaryStatement.all(...params),
  };
}

function transaction(fn) {
  if (dbConfig.mode === 'sqlite') {
    return async () => {
      const sqlite = getSqliteDb();
      sqlite.exec('BEGIN');
      try {
        const result = await Promise.resolve(fn());
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        try { sqlite.exec('ROLLBACK'); } catch {}
        throw err;
      }
    };
  }

  if (dbConfig.mode === 'sqlserver') {
    return async () => {
      const tx = await createSqlServerTransaction();
      return connectionContextStorage.run({ sqlserver: tx }, async () => {
        try {
          const result = await Promise.resolve(fn());
          await tx.commit();
          return result;
        } catch (err) {
          try { await tx.rollback(); } catch {}
          throw err;
        }
      });
    };
  }

  return async () => {
    const sqlite = getSqliteDb();
    const sqlTx = await createSqlServerTransaction();

    try {
      sqlite.exec('BEGIN');
    } catch (err) {
      try { await sqlTx.rollback(); } catch {}
      throw err;
    }

    const context = { hybrid: true, sqlserver: sqlTx };

    return connectionContextStorage.run(context, async () => {
      try {
        const result = await Promise.resolve(fn());

        if (dbConfig.primary === 'sqlite') {
          try {
            await sqlTx.commit();
          } catch (err) {
            recordMirrorFailure(err, 'transaction commit');
            try { sqlite.exec('ROLLBACK'); } catch {}
            throw err;
          }
          try {
            sqlite.exec('COMMIT');
            recordMirrorSuccess();
          } catch (err) {
            recordMirrorFailure(err, 'primary transaction commit');
            throw err;
          }
          return result;
        }

        try {
          sqlite.exec('COMMIT');
        } catch (err) {
          recordMirrorFailure(err, 'transaction commit');
          try { await sqlTx.rollback(); } catch {}
          throw err;
        }
        await sqlTx.commit();
        recordMirrorSuccess();
        return result;
      } catch (err) {
        try { sqlite.exec('ROLLBACK'); } catch {}
        try { await sqlTx.rollback(); } catch {}
        throw err;
      }
    });
  };
}

async function exec(sqlText) {
  if (dbConfig.mode === 'sqlite') return execOnBackend('sqlite', sqlText);
  if (dbConfig.mode === 'sqlserver') return execOnBackend('sqlserver', sqlText);

  const primaryResult = await execOnBackend(dbConfig.primary, sqlText);
  try {
    await execOnBackend(dbConfig.secondary, sqlText);
    recordMirrorSuccess();
  } catch (err) {
    recordMirrorFailure(err, 'exec');
    if (getConnectionContext() && getConnectionContext().hybrid) throw err;
  }
  return primaryResult;
}

async function ensureSqlServerSchema() {
  let statements;
  try {
    statements = require('./sqlserver-schema');
  } catch {
    statements = [];
  }

  for (const statement of statements) {
    await executeSqlServer(statement);
  }
}

async function initialize() {
  if (dbConfig.usesSqlite) getSqliteDb();
  if (dbConfig.usesSqlServer) await ensureSqlServerSchema();

  if (dbConfig.syncOnStartup) {
    await syncMirrorFromPrimary('startup');
  }
}

module.exports = {
  db: { prepare, transaction, exec },
  initialize,
  getDbConfig: () => ({ ...dbConfig }),
  getDbStatus,
};
