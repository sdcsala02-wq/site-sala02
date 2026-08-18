require('dotenv').config();

const pool = require('./config/database');

async function testarConexao() {
  try {
    const resultado = await pool.query(`
      SELECT
        NOW() AS horario,
        current_database() AS banco,
        current_user AS usuario
    `);

    console.log('================================');
    console.log('✅ CONEXÃO COM POSTGRESQL OK');
    console.table(resultado.rows);
    console.log('================================');
  } catch (erro) {
    console.error('❌ FALHA NA CONEXÃO');
    console.error('Código:', erro.code || 'não informado');
    console.error('Mensagem:', erro.message);
  } finally {
    await pool.end();
  }
}

testarConexao();