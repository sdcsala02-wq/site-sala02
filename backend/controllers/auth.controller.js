const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const pool = require("../config/database");
const {
  registrarAuditoria
} = require("../services/auditoria.service");

const NOME_COOKIE_TOKEN = "sala02_token";
const ALGORITMO_JWT = "HS256";
const EMISSOR_JWT = "sala02-api";
const AUDIENCIA_JWT = "sala02-portal";
const DURACAO_TOKEN_MS =
  8 * 60 * 60 * 1000;

function ambienteProducao() {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_ENVIRONMENT_ID) ||
    Boolean(process.env.RAILWAY_PUBLIC_DOMAIN)
  );
}

function opcoesCookieToken() {
  const producao = ambienteProducao();

  return {
    httpOnly: true,
    secure: producao,
    sameSite: producao
      ? "none"
      : "lax",
    path: "/",
    maxAge: DURACAO_TOKEN_MS
  };
}

function opcoesLimpezaCookie() {
  const opcoes = opcoesCookieToken();

  delete opcoes.maxAge;

  return opcoes;
}

function somenteNumeros(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function validarCPF(valor) {
  const cpf = somenteNumeros(valor);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;

  for (let i = 0; i < 9; i++) {
    soma += Number(cpf[i]) * (10 - i);
  }

  let digito1 = 11 - (soma % 11);
  if (digito1 >= 10) digito1 = 0;

  if (digito1 !== Number(cpf[9])) {
    return false;
  }

  soma = 0;

  for (let i = 0; i < 10; i++) {
    soma += Number(cpf[i]) * (11 - i);
  }

  let digito2 = 11 - (soma % 11);
  if (digito2 >= 10) digito2 = 0;

  return digito2 === Number(cpf[10]);
}

function validarCNPJ(valor) {
  const cnpj = somenteNumeros(valor);

  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  function calcularDigito(base, pesos) {
    let soma = 0;

    for (let i = 0; i < pesos.length; i++) {
      soma += Number(base[i]) * pesos[i];
    }

    const resto = soma % 11;

    return resto < 2 ? 0 : 11 - resto;
  }

  const primeiro = calcularDigito(
    cnpj.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  if (primeiro !== Number(cnpj[12])) {
    return false;
  }

  const segundo = calcularDigito(
    cnpj.slice(0, 13),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  return segundo === Number(cnpj[13]);
}

function mascararDocumento(documento) {
  if (documento.length === 11) {
    return `***.***.***-${documento.slice(-2)}`;
  }

  if (documento.length === 14) {
    return `**.***.***/****-${documento.slice(-2)}`;
  }

  return "***";
}

function gerarToken(usuario, contexto = {}) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET nao configurado.");
  }

  return jwt.sign(
    {
      id: usuario.id,
      uuid: usuario.uuid,
      nome: usuario.nome,
      perfil: usuario.perfil,

      loginVia: contexto.loginVia || "CPF",

      empresaId:
        contexto.empresaId || null
    },
    process.env.JWT_SECRET,
    {
      algorithm: ALGORITMO_JWT,
      issuer: EMISSOR_JWT,
      audience: AUDIENCIA_JWT,
      expiresIn: "8h"
    }
  );
}

async function buscarPorCPF(cpf) {
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
      WHERE cpf = $1
      LIMIT 1
    `,
    [cpf]
  );

  if (!resultado.rowCount) {
    return null;
  }

  return {
    usuario: resultado.rows[0],
    loginVia: "CPF",
    empresa: null
  };
}

async function buscarPorCNPJ(cnpj) {
  const resultado = await pool.query(
    `
      SELECT
        u.id,
        u.uuid,
        u.nome,
        u.cpf,
        u.email,
        u.telefone,
        u.senha_hash,
        u.perfil,
        u.status,
        u.email_verificado,

        e.id AS empresa_id,
        e.cnpj AS empresa_cnpj,
        e.razao_social,
        e.nome_fantasia,
        e.status AS empresa_status

      FROM empresas e

      INNER JOIN empresa_usuarios eu
        ON eu.empresa_id = e.id
       AND eu.papel = 'TITULAR'
       AND eu.status = 'ATIVO'

      INNER JOIN usuarios u
        ON u.id = eu.usuario_id

      WHERE e.cnpj = $1
      LIMIT 1
    `,
    [cnpj]
  );

  if (!resultado.rowCount) {
    return null;
  }

  const linha = resultado.rows[0];

  if (
    !["ATIVA", "ATIVO"].includes(
      String(linha.empresa_status || "").toUpperCase()
    )
  ) {
    return null;
  }

  return {
    usuario: {
      id: linha.id,
      uuid: linha.uuid,
      nome: linha.nome,
      cpf: linha.cpf,
      email: linha.email,
      telefone: linha.telefone,
      senha_hash: linha.senha_hash,
      perfil: linha.perfil,
      status: linha.status,
      email_verificado: linha.email_verificado
    },

    loginVia: "CNPJ",

    empresa: {
      id: linha.empresa_id,
      cnpj: linha.empresa_cnpj,
      razao_social: linha.razao_social,
      nome_fantasia: linha.nome_fantasia
    }
  };
}

async function login(req, res) {
  const documento = somenteNumeros(
    req.body.documento ||
    req.body.cpf ||
    req.body.cnpj ||
    ""
  );

  const senha = String(
    req.body.senha || ""
  );

  if (!documento || !senha) {
    return res.status(400).json({
      erro: "Informe o CPF ou CNPJ e a senha."
    });
  }

  let tipoDocumento;

  if (documento.length === 11) {
    tipoDocumento = "CPF";

    if (!validarCPF(documento)) {
      return res.status(400).json({
        erro: "CPF invalido."
      });
    }
  } else if (documento.length === 14) {
    tipoDocumento = "CNPJ";

    if (!validarCNPJ(documento)) {
      return res.status(400).json({
        erro: "CNPJ invalido."
      });
    }
  } else {
    return res.status(400).json({
      erro: "Informe um CPF ou CNPJ valido."
    });
  }

  try {
    const acesso =
      tipoDocumento === "CPF"
        ? await buscarPorCPF(documento)
        : await buscarPorCNPJ(documento);

    if (!acesso) {
      await registrarAuditoria({
        acao: "LOGIN_FALHOU",
        entidade: "usuarios",
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        dadosNovos: {
          tipo_documento: tipoDocumento,
          documento: mascararDocumento(documento),
          motivo: "Conta nao encontrada"
        }
      });

      return res.status(401).json({
        erro: "CPF/CNPJ ou senha invalidos."
      });
    }

    const usuario = acesso.usuario;

    if (usuario.status !== "ATIVO") {
      await registrarAuditoria({
        usuarioId: usuario.id,
        acao: "LOGIN_FALHOU",
        entidade: "usuarios",
        entidadeId: usuario.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        dadosNovos: {
          tipo_documento: tipoDocumento,
          motivo: "Usuario inativo"
        }
      });

      return res.status(403).json({
        erro: "Esta conta nao esta ativa."
      });
    }

    const senhaCorreta = await bcrypt.compare(
      senha,
      usuario.senha_hash
    );

    if (!senhaCorreta) {
      await registrarAuditoria({
        usuarioId: usuario.id,
        acao: "LOGIN_FALHOU",
        entidade: "usuarios",
        entidadeId: usuario.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        dadosNovos: {
          tipo_documento: tipoDocumento,
          motivo: "Senha incorreta"
        }
      });

      return res.status(401).json({
        erro: "CPF/CNPJ ou senha invalidos."
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

    const token = gerarToken(
      usuario,
      {
        loginVia: acesso.loginVia,
        empresaId:
          acesso.empresa
            ? acesso.empresa.id
            : null
      }
    );

    await registrarAuditoria({
      usuarioId: usuario.id,
      acao: "LOGIN_SUCESSO",
      entidade: "usuarios",
      entidadeId: usuario.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      dadosNovos: {
        login_via: acesso.loginVia,
        empresa_id:
          acesso.empresa
            ? acesso.empresa.id
            : null
      }
    });

    res.cookie(
      NOME_COOKIE_TOKEN,
      token,
      opcoesCookieToken()
    );

    res.set(
      "Cache-Control",
      "no-store"
    );

    return res.json({
      sucesso: true,

      login_via: acesso.loginVia,

      usuario: {
        id: usuario.id,
        uuid: usuario.uuid,
        nome: usuario.nome,
        cpf: usuario.cpf,
        email: usuario.email,
        telefone: usuario.telefone,
        perfil: usuario.perfil,
        email_verificado: usuario.email_verificado
      },

      empresa: acesso.empresa
    });

  } catch (erro) {
    console.error(
      "Erro no login CPF/CNPJ:",
      erro
    );

    return res.status(500).json({
      erro: "Erro interno ao realizar o login."
    });
  }
}

async function logout(req, res) {
  res.clearCookie(
    NOME_COOKIE_TOKEN,
    opcoesLimpezaCookie()
  );

  res.set(
    "Cache-Control",
    "no-store"
  );

  await registrarAuditoria({
    usuarioId: req.usuario.id,
    acao: "LOGOUT",
    entidade: "usuarios",
    entidadeId: req.usuario.id,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    dadosNovos: {
      sessao_encerrada: true
    }
  });

  return res.json({
    sucesso: true,
    mensagem: "Sessao encerrada com sucesso."
  });
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

    if (!resultado.rowCount) {
      return res.status(404).json({
        erro: "Usuario nao encontrado."
      });
    }

    return res.json(resultado.rows[0]);

  } catch (erro) {
    console.error(
      "Erro ao consultar usuario atual:",
      erro
    );

    return res.status(500).json({
      erro: "Erro ao consultar os dados do usuario."
    });
  }
}

module.exports = {
  login,
  logout,
  usuarioAtual
};
