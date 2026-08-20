const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");

// SESSAO_REVOGAVEL_V1

const NOME_COOKIE_TOKEN =
  "sala02_token";

const ALGORITMO_JWT =
  "HS256";

const EMISSOR_JWT =
  "sala02-api";

const AUDIENCIA_JWT =
  "sala02-portal";

function obterCookie(req, nome) {
  const cabecalhoCookies =
    req.headers.cookie;

  if (!cabecalhoCookies) {
    return null;
  }

  const cookies =
    cabecalhoCookies.split(";");

  for (const cookie of cookies) {
    const separador =
      cookie.indexOf("=");

    if (separador < 0) {
      continue;
    }

    const chave =
      cookie
        .slice(0, separador)
        .trim();

    if (chave !== nome) {
      continue;
    }

    const valor =
      cookie
        .slice(separador + 1)
        .trim();

    try {
      return decodeURIComponent(valor);
    } catch {
      return valor;
    }
  }

  return null;
}

function obterToken(req) {
  return obterCookie(
    req,
    NOME_COOKIE_TOKEN
  );
}

function gerarTokenCsrf(
  tokenAutenticacao
) {
  if (
    !tokenAutenticacao ||
    !process.env.JWT_SECRET
  ) {
    return null;
  }

  return crypto
    .createHmac(
      "sha256",
      process.env.JWT_SECRET
    )
    .update(
      `csrf:${tokenAutenticacao}`
    )
    .digest("hex");
}

async function autenticar(req, res, next) {
  const token =
    obterToken(req);

  if (!token) {
    return res.status(401).json({
      erro:
        "Token de acesso nao informado."
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      erro:
        "Servico de autenticacao indisponivel."
    });
  }

  let dados;

  try {
    dados =
      jwt.verify(
        token,
        process.env.JWT_SECRET,
        {
          algorithms: [
            ALGORITMO_JWT
          ],
          issuer:
            EMISSOR_JWT,
          audience:
            AUDIENCIA_JWT
        }
      );
  } catch {
    return res.status(401).json({
      erro:
        "Token invalido ou expirado."
    });
  }

  let estadoUsuario;

  try {
    const resultado =
      await pool.query(
        `
          SELECT
            id,
            uuid,
            nome,
            perfil,
            status,
            sessao_versao
          FROM usuarios
          WHERE id = $1
          LIMIT 1
        `,
        [dados.id]
      );

    estadoUsuario =
      resultado.rows[0] || null;

  } catch (erroBanco) {
    console.error(
      "Erro ao validar sessao no banco:",
      erroBanco
    );

    return res.status(500).json({
      erro:
        "Servico de autenticacao temporariamente indisponivel."
    });
  }

  const versaoToken =
    Number(
      dados.sessaoVersao || 1
    );

  const versaoBanco =
    estadoUsuario
      ? Number(
          estadoUsuario.sessao_versao || 1
        )
      : 0;

  if (
    !estadoUsuario ||
    estadoUsuario.status !== "ATIVO" ||
    versaoToken !== versaoBanco
  ) {
    res.clearCookie(
      NOME_COOKIE_TOKEN,
      {
        path: "/"
      }
    );

    return res.status(401).json({
      erro:
        "Sessao expirada ou revogada. Entre novamente."
    });
  }

  req.tokenAutenticacao =
    token;

  req.usuario = {
    id:
      estadoUsuario.id,
    uuid:
      estadoUsuario.uuid,
    nome:
      estadoUsuario.nome,
    perfil:
      estadoUsuario.perfil,
    loginVia:
      dados.loginVia || "CPF",
    empresaId:
      dados.empresaId || null
  };

  next();
}


function permitirPerfis(
  ...perfisPermitidos
) {
  return function verificarPerfil(
    req,
    res,
    next
  ) {
    if (!req.usuario) {
      return res.status(401).json({
        erro:
          "Usuario nao autenticado."
      });
    }

    if (
      !perfisPermitidos.includes(
        req.usuario.perfil
      )
    ) {
      return res.status(403).json({
        erro:
          "Voce nao possui permissao para esta acao."
      });
    }

    next();
  };
}

function protegerCsrf(
  req,
  res,
  next
) {
  const recebido =
    String(
      req.headers[
        "x-csrf-token"
      ] || ""
    );

  const esperado =
    gerarTokenCsrf(
      req.tokenAutenticacao
    );

  if (
    !recebido ||
    !esperado
  ) {
    return res.status(403).json({
      erro:
        "Token CSRF ausente ou invalido."
    });
  }

  const bufferRecebido =
    Buffer.from(
      recebido,
      "utf8"
    );

  const bufferEsperado =
    Buffer.from(
      esperado,
      "utf8"
    );

  if (
    bufferRecebido.length !==
    bufferEsperado.length
  ) {
    return res.status(403).json({
      erro:
        "Token CSRF ausente ou invalido."
    });
  }

  if (
    !crypto.timingSafeEqual(
      bufferRecebido,
      bufferEsperado
    )
  ) {
    return res.status(403).json({
      erro:
        "Token CSRF ausente ou invalido."
    });
  }

  next();
}

module.exports = {
  autenticar,
  permitirPerfis,
  protegerCsrf,
  gerarTokenCsrf
};