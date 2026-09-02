const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "djuser",
  password: process.env.DB_PASSWORD || "djpassword",
  database: process.env.DB_NAME || "dj_queue",
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || "25", 10),
  maxIdle: parseInt(process.env.DB_MAX_IDLE || "10", 10),
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// Test de connexion
if (process.env.NODE_ENV !== "test") {
  pool
    .getConnection()
    .then((connection) => {
      connection.release();
    })
    .catch((err) => {
      console.error("❌ Erreur connexion MySQL:", err.message);
      process.exit(1);
    });
}

module.exports = pool;
