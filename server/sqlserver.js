/**
 * GAMEGLITZ — SQL Server connection helper
 * Connects to SQL Server / SSMS using the `mssql` package.
 */
let sql;
function getSql() {
  if (!sql) {
    try {
      sql = require('mssql/msnodesqlv8');
    } catch (err) {
      try {
        sql = require('mssql');
      } catch (err2) {
        throw new Error('SQL Server support requires the optional dependency "mssql". Run npm install in server to add it.');
      }
    }
  }
  return sql;
}

const SQLSERVER_HOST = process.env.SQLSERVER_HOST || 'localhost';
const SQLSERVER_INSTANCE = process.env.SQLSERVER_INSTANCE || '';
const SQLSERVER_PORT = process.env.SQLSERVER_PORT ? Number(process.env.SQLSERVER_PORT) : undefined;
const SQLSERVER_AUTH = process.env.SQLSERVER_AUTH || 'sql';
const SQLSERVER_USER = process.env.SQLSERVER_USER || 'sa';
const SQLSERVER_PASSWORD = process.env.SQLSERVER_PASSWORD || '';
const SQLSERVER_DOMAIN = process.env.SQLSERVER_DOMAIN || '';

const useWindowsAuth = SQLSERVER_AUTH.toLowerCase() === 'windows';

const sqlConfig = {};

if (useWindowsAuth) {
  // Build ODBC-style connection string for msnodesqlv8 (true Windows Auth)
  let serverPart = SQLSERVER_HOST;
  if (SQLSERVER_INSTANCE) serverPart += '\\' + SQLSERVER_INSTANCE;
  const dbName = process.env.SQLSERVER_DATABASE || 'GameGlitz';
  const trustCert = process.env.SQLSERVER_TRUST_CERT !== 'false' ? 'Yes' : 'No';

  sqlConfig.connectionString =
    `Driver={ODBC Driver 17 for SQL Server};Server=${serverPart};Database=${dbName};Trusted_Connection=Yes;TrustServerCertificate=${trustCert};`;
  sqlConfig.pool = { max: 10, min: 0, idleTimeoutMillis: 30000 };
} else {
  sqlConfig.server = SQLSERVER_HOST;
  sqlConfig.database = process.env.SQLSERVER_DATABASE || 'GameGlitz';
  sqlConfig.pool = { max: 10, min: 0, idleTimeoutMillis: 30000 };
  sqlConfig.options = {
    encrypt: process.env.SQLSERVER_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQLSERVER_TRUST_CERT !== 'false',
    instanceName: SQLSERVER_INSTANCE || undefined,
  };
  if (!SQLSERVER_INSTANCE && SQLSERVER_PORT) {
    sqlConfig.port = SQLSERVER_PORT;
  }
  sqlConfig.user = SQLSERVER_USER;
  sqlConfig.password = SQLSERVER_PASSWORD;
}

let poolPromise;
let activePool = null;
let dbEnsured = false;

async function connectWithPool(config) {
  const Sql = getSql();
  const pool = new Sql.ConnectionPool(config);
  return pool.connect();
}

/**
 * Connects to the `master` database and creates the target database if it
 * does not already exist.  Called once before the main pool is opened.
 */
async function ensureDatabase() {
  if (dbEnsured) return;
  const dbName = process.env.SQLSERVER_DATABASE || 'GameGlitz';
  const sql2 = getSql();

  let masterConfig;
  if (useWindowsAuth) {
    let serverPart = SQLSERVER_HOST;
    if (SQLSERVER_INSTANCE) serverPart += '\\' + SQLSERVER_INSTANCE;
    const trustCert = process.env.SQLSERVER_TRUST_CERT !== 'false' ? 'Yes' : 'No';
    masterConfig = {
      connectionString: `Driver={ODBC Driver 17 for SQL Server};Server=${serverPart};Database=master;Trusted_Connection=Yes;TrustServerCertificate=${trustCert};`,
      pool: { max: 2, min: 0, idleTimeoutMillis: 10000 },
    };
  } else {
    masterConfig = {
      ...sqlConfig,
      database: 'master',
      pool: { max: 2, min: 0, idleTimeoutMillis: 10000 },
    };
  }

  const masterPool = await connectWithPool(masterConfig);
  try {
    // Sanitise dbName — only allow safe identifier characters
    const safeDb = dbName.replace(/[^A-Za-z0-9_]/g, '');
    await masterPool.request().query(
      `IF DB_ID(N'${safeDb}') IS NULL CREATE DATABASE [${safeDb}]`
    );
  } finally {
    await masterPool.close();
  }
  dbEnsured = true;
}

function getPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      await ensureDatabase();
      const pool = await connectWithPool(sqlConfig);
      activePool = pool;
      if (typeof pool.on === 'function') {
        pool.on('error', () => {
          if (activePool === pool) {
            activePool = null;
            poolPromise = null;
          }
        });
      }
      return pool;
    })().catch(async (err) => {
      poolPromise = null;
      if (activePool) {
        try { await activePool.close(); } catch {}
        activePool = null;
      }
      throw err;
    });
  }
  return poolPromise;
}

async function closePool() {
  const pool = activePool;
  activePool = null;
  poolPromise = null;
  if (!pool) return;
  try {
    await pool.close();
  } catch {}
}

async function testConnection() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT 1 AS value');
  return result.recordset[0];
}

async function query(sqlText, params = []) {
  const pool = await getPool();
  const request = pool.request();
  params.forEach(({ name, type, value }) => request.input(name, type, value));
  const result = await request.query(sqlText);
  return result.recordset;
}

/**
 * Execute a query using the raw msnodesqlv8 driver with ? positional params.
 * Falls back to the mssql pool for SQL-auth configurations where msnodesqlv8
 * may not be installed or the connection string approach won't work.
 */
async function rawQuery(sqlText, params = []) {
  // msnodesqlv8 requires a proper ODBC connection string.
  // For SQL-auth mode, sqlConfig.connectionString is NOT set, so we'd have to
  // build one — but msnodesqlv8 SQL-auth support is unreliable.
  // Use the mssql pool with @p1… named params for SQL-auth instead.
  const connStr = sqlConfig.connectionString || (useWindowsAuth ? _buildConnectionString() : null);

  if (connStr) {
    // Windows auth path: use msnodesqlv8 with ODBC connection string
    let msnodesqlv8;
    try { msnodesqlv8 = require('msnodesqlv8'); } catch {
      throw new Error('msnodesqlv8 is required for Windows Authentication. Run: npm install msnodesqlv8');
    }
    return new Promise((resolve, reject) => {
      msnodesqlv8.query(connStr, sqlText, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  // SQL-auth path: use the mssql pool with named @p1, @p2… parameters
  const pool = await getPool();
  const request = pool.request();
  let idx = 0;
  const namedSql = sqlText.replace(/\?/g, () => `@p${++idx}`);
  params.forEach((val, i) => request.input(`p${i + 1}`, val));
  const result = await request.query(namedSql);
  return result.recordset || [];
}

function _buildConnectionString() {
  let cs = `Driver={ODBC Driver 17 for SQL Server};Server=${sqlConfig.server}`;
  if (sqlConfig.options && sqlConfig.options.instanceName) {
    cs = `Driver={ODBC Driver 17 for SQL Server};Server=${sqlConfig.server}\\${sqlConfig.options.instanceName}`;
  }
  cs += `;Database=${sqlConfig.database}`;
  if (useWindowsAuth) {
    cs += ';Trusted_Connection=Yes';
  } else {
    cs += `;UID=${sqlConfig.user};PWD=${sqlConfig.password}`;
  }
  cs += `;TrustServerCertificate=${sqlConfig.options && sqlConfig.options.trustServerCertificate ? 'Yes' : 'No'}`;
  return cs;
}

module.exports = {
  sqlConfig,
  getPool,
  closePool,
  ensureDatabase,
  testConnection,
  query,
  rawQuery,
};
