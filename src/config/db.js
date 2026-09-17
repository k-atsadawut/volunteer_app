import mysql from 'mysql2/promise';

// Parse DATABASE_URL into connection config
// Format: mysql://user:password@host:port/database
function parseConnectionConfig(env) {
  // Prefer DATABASE_URL secret for direct connection (e.g., TiDB Cloud)
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    return {
      host: url.hostname,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      port: parseInt(url.port, 10) || 3306,
      ssl: { rejectUnauthorized: true },
      disableEval: true,
    };
  }

  // Fallback to Hyperdrive binding
  if (env.HYPERDRIVE) {
    return {
      host: env.HYPERDRIVE.host,
      user: env.HYPERDRIVE.user,
      password: env.HYPERDRIVE.password,
      database: env.HYPERDRIVE.database,
      port: env.HYPERDRIVE.port,
      disableEval: true,
    };
  }

  throw new Error('No database configuration found. Set DATABASE_URL secret or configure HYPERDRIVE.');
}

let certificateColumnEnsured = false;

async function ensureCertificateColumn(connection) {
  if (certificateColumnEnsured) return;
  try {
    await connection.query(`
      ALTER TABLE registrations ADD COLUMN CertificateUrl VARCHAR(500) NULL
    `);
    console.log('[DB Auto-Migration] Added CertificateUrl column to registrations table');
  } catch (err) {
    if (!err.message?.includes('Duplicate column name')) {
      console.warn('[DB Auto-Migration Warning]', err.message);
    }
  }
  certificateColumnEnsured = true;
}

export async function executeQuery(sql, params = [], env) {
  const connection = await mysql.createConnection(parseConnectionConfig(env));

  try {
    let rows;
    try {
      [rows] = await connection.query(sql, params);
    } catch (err) {
      if (err.message && (err.message.includes("Unknown column 'CertificateUrl'") || err.code === 'ER_BAD_FIELD_ERROR')) {
        await ensureCertificateColumn(connection);
        [rows] = await connection.query(sql, params);
      } else {
        throw err;
      }
    }
    return rows;
  } finally {
    await connection.end();
  }
}

// Execute multiple queries in a transaction
export async function executeTransaction(queries, env) {
  const connection = await mysql.createConnection(parseConnectionConfig(env));

  try {
    await connection.beginTransaction();
    const results = [];
    for (const { sql, params } of queries) {
      try {
        const [rows] = await connection.query(sql, params);
        results.push(rows);
      } catch (err) {
        if (err.message && (err.message.includes("Unknown column 'CertificateUrl'") || err.code === 'ER_BAD_FIELD_ERROR')) {
          await ensureCertificateColumn(connection);
          const [rows] = await connection.query(sql, params);
          results.push(rows);
        } else {
          throw err;
        }
      }
    }
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}
