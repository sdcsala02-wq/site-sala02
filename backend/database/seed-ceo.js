require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('../config/database');

async function criarUsuarioCEO() {
  const nome = process.env.CEO_NOME || 'Administrador Sala 02';
  const email = process.env.CEO_EMAIL;
  const cpf = process.env.CEO_CPF || null;
  const telefone = process.env.CEO_TELEFONE || null;
  const senha = process.env.CEO_SENHA;

  if (!email || !senha) {
    throw new Error(
      'Defina CEO_EMAIL e CEO_SENHA no arquivo .env.'
    );
  }

  if (senha.length < 8) {
    throw new Error(
      'A senha do CEO deve possuir pelo menos 8 caracteres.'
    );
  }

  const emailNormalizado = email.trim().toLowerCase();
  const cpfNormalizado = cpf
    ? cpf.replace(/\D/g, '')
    : null;

  const senhaHash = await bcrypt.hash(senha, 12);

  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');

    const usuarioExistente = await cliente.query(
      `
        SELECT id, email
        FROM usuarios
        WHERE email = $1
           OR ($2::VARCHAR IS NOT NULL AND cpf = $2)
        LIMIT 1
      `,
      [emailNormalizado, cpfNormalizado]
    );

    if (usuarioExistente.rowCount > 0) {
      console.log('O usuário CEO já está cadastrado.');
      await cliente.query('ROLLBACK');
      return;
    }

    const resultado = await cliente.query(
      `
        INSERT INTO usuarios (
          nome,
          cpf,
          email,
          telefone,
          senha_hash,
          perfil,
          status,
          email_verificado
        )
        VALUES ($1, $2, $3, $4, $5, 'CEO', 'ATIVO', TRUE)
        RETURNING id, uuid, nome, email, perfil, status
      `,
      [
        nome,
        cpfNormalizado,
        emailNormalizado,
        telefone,
        senhaHash
      ]
    );

    await cliente.query(
      `
        INSERT INTO logs_auditoria (
          usuario_id,
          acao,
          entidade,
          entidade_id,
          dados_novos
        )
        VALUES ($1, 'CRIAR_USUARIO_CEO', 'usuarios', $1, $2::JSONB)
      `,
      [
        resultado.rows[0].id,
        JSON.stringify({
          nome: resultado.rows[0].nome,
          email: resultado.rows[0].email,
          perfil: resultado.rows[0].perfil
        })
      ]
    );

    await cliente.query('COMMIT');

    console.log('====================================');
    console.log('✅ USUÁRIO CEO CRIADO COM SUCESSO');
    console.table(resultado.rows);
    console.log('====================================');
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

criarUsuarioCEO()
  .catch(erro => {
    console.error('❌ Erro ao criar usuário CEO:');
    console.error(erro.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });