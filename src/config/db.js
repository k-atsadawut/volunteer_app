import mysql from 'mysql2/promise';

export async function executeQuery(sql, params = [], env) {
  const connection = await mysql.createConnection({
    host: env.HYPERDRIVE.host,
    user: env.HYPERDRIVE.user,
    password: env.HYPERDRIVE.password,
    database: env.HYPERDRIVE.database,
    port: env.HYPERDRIVE.port,
    disableEval: true,
  });

  try {
    const [rows] = await connection.query(sql, params);
    return rows;
  } finally {
    await connection.end();
  }
}

// Execute multiple queries in a transaction
export async function executeTransaction(queries, env) {
  const connection = await mysql.createConnection({
    host: env.HYPERDRIVE.host,
    user: env.HYPERDRIVE.user,
    password: env.HYPERDRIVE.password,
    database: env.HYPERDRIVE.database,
    port: env.HYPERDRIVE.port,
    disableEval: true,
  });

  try {
    await connection.beginTransaction();
    const results = [];
    for (const { sql, params } of queries) {
      const [rows] = await connection.query(sql, params);
      results.push(rows);
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
