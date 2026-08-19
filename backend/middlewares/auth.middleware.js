const jwt = require("jsonwebtoken");

const NOME_COOKIE_TOKEN =
  "sala02_token";
const ALGORITMO_JWT = "HS256";
const EMISSOR_JWT = "sala02-api";
const AUDIENCIA_JWT = "sala02-portal";

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

function autenticar(req, res, next) {
  const token = obterToken(req);

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

  try {
    const dados = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        algorithms: [ALGORITMO_JWT],
        issuer: EMISSOR_JWT,
        audience: AUDIENCIA_JWT
      }
    );

    req.usuario = {
      id: dados.id,
      uuid: dados.uuid,
      nome: dados.nome,
      perfil: dados.perfil,
      loginVia:
        dados.loginVia || "CPF",
      empresaId:
        dados.empresaId || null
    };

    next();

  } catch {
    return res.status(401).json({
      erro:
        "Token invalido ou expirado."
    });
  }
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

module.exports = {
  autenticar,
  permitirPerfis
};