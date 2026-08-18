const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const pool = require('../config/database');
const {
  registrarAuditoria
} = require('../services/auditoria.service');

function gerarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      uuid: usuario.uuid,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '8h'
    }
  );
}

async function login(req, res) {
  const identificador = String(
    req.body.identificador ||
    req.body.email ||
    req.body.usuario ||
    ''
  ).trim();

  const senha = String(
    req.body.senha || ''
  );

  if (!identificador || !senha) {
    return res.status(400).json({
      erro: 'Informe o e-mail, CPF ou usuário e a senha.'
    });
  }

  const identificadorNormalizado =
    identificador.toLowerCase();

  const cpfNormalizado =
    identificador.replace(/\D/g, '');

  try {
    const resultado = await pool.query(
      `
        SELECT
          id,
          uuid,
          nome,
          cpf,
          email,
          telefone,
          senha_hash,
          perfil,
          status,
          email_verificado
        FROM usuarios
        WHERE LOWER(email) = $1
           OR cpf = $2
        LIMIT 1
      `,
      [
        identificadorNormalizado,
        cpfNormalizado || null
      ]
    );

    if (resultado.rowCount === 0) {
      await registrarAuditoria({
        acao: 'LOGIN_FALHOU',
        entidade: 'usuarios',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        dadosNovos: {
          identificador: identificadorNormalizado,
          motivo: 'Usuário não encontrado'
        }
      });

      return res.status(401).json({
        erro: 'Usuário ou senha inválidos.'
      });
    }

    const usuario = resultado.rows[0];

    if (usuario.status !== 'ATIVO') {
      return res.status(403).json({
        erro: 'Este usuário está inativo.'
      });
    }

    const senhaCorreta = await bcrypt.compare(
      senha,
      usuario.senha_hash
    );

    if (!senhaCorreta) {
      await registrarAuditoria({
        usuarioId: usuario.id,
        acao: 'LOGIN_FALHOU',
        entidade: 'usuarios',
        entidadeId: usuario.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        dadosNovos: {
          motivo: 'Senha incorreta'
        }
      });

      return res.status(401).json({
        erro: 'Usuário ou senha inválidos.'
      });
    }

    await pool.query(
      `
        UPDATE usuarios
        SET ultimo_login = NOW()
        WHERE id = $1
      `,
      [usuario.id]
    );

    const token = gerarToken(usuario);

    await registrarAuditoria({
      usuarioId: usuario.id,
      acao: 'LOGIN_SUCESSO',
      entidade: 'usuarios',
      entidadeId: usuario.id,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.json({
      sucesso: true,
      token,
      usuario: {
        id: usuario.id,
        uuid: usuario.uuid,
        nome: usuario.nome,
        cpf: usuario.cpf,
        email: usuario.email,
        telefone: usuario.telefone,
        perfil: usuario.perfil,
        email_verificado: usuario.email_verificado
      }
    });
  } catch (erro) {
    console.error('Erro no login:', erro);

    return res.status(500).json({
      erro: 'Erro interno ao realizar o login.'
    });
  }
}

async function usuarioAtual(req, res) {
  try {
    const resultado = await pool.query(
      `
        SELECT
          id,
          uuid,
          nome,
          cpf,
          email,
          telefone,
          perfil,
          status,
          email_verificado,
          ultimo_login,
          criado_em
        FROM usuarios
        WHERE id = $1
        LIMIT 1
      `,
      [req.usuario.id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        erro: 'Usuário não encontrado.'
      });
    }

    return res.json(resultado.rows[0]);
  } catch (erro) {
    console.error(
      'Erro ao consultar usuário atual:',
      erro
    );

    return res.status(500).json({
      erro: 'Erro ao consultar os dados do usuário.'
    });
  }
}

module.exports = {
  login,
  usuarioAtual
};