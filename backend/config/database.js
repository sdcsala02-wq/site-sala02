const { Pool } = require('pg');
require('dotenv').config();

const estaNoRailway = Boolean(process.env.RAILWAY_ENVIRONMENT);

const configuracao = estaNoRailway
  ? {
    connectionString: process.env.DATABASE_URL,
    ssl: false
  }
  : {
    host: process.env.PGHOST_LOCAL,
    port: Number(process.env.PGPORT_LOCAL),
    user: process.env.PGUSER_LOCAL,
    password: process.env.PGPASSWORD_LOCAL,
    database: process.env.PGDATABASE_LOCAL,
    ssl: {
      rejectUnauthorized: false
    }
  };

const pool = new Pool(configuracao);

pool.on('error', erro => {
  console.error('Erro inesperado no PostgreSQL:', erro.message);
});

module.exports = pool;