require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('./config/database');

async function testar() {
  const email = process.env.CEO_EMAIL;
  const senha = process.env.CEO_SENHA;

  try {
    const resultado = await pool.query(
      `
        SELECT
          id,
          nome,
          email,
          senha_hash,
          perfil,
          status
        FROM usuarios
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email]
    );

    if (resultado.rowCount === 0) {
      throw new Error(
        'Usuário CEO não encontrado.'
      );
    }

    const usuario = resultado.rows[0];

    const senhaCorreta = await bcrypt.compare(
      senha,
      usuario.senha_hash
    );

    console.log('================================');
    console.log('USUÁRIO:', usuario.email);
    console.log('PERFIL:', usuario.perfil);
    console.log('STATUS:', usuario.status);
    console.log(
      'SENHA VALIDADA:',
      senhaCorreta ? 'SIM' : 'NÃO'
    );
    console.log('================================');
  } catch (erro) {
    console.error('Erro no teste:', erro.message);
  } finally {
    await pool.end();
  }
}

testar();