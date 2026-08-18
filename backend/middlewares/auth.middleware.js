const jwt = require('jsonwebtoken');

function obterToken(req) {
  const cabecalho = req.headers.authorization;

  if (!cabecalho || !cabecalho.startsWith('Bearer ')) {
    return null;
  }

  return cabecalho.substring(7).trim();
}

function autenticar(req, res, next) {
  const token = obterToken(req);

  if (!token) {
    return res.status(401).json({
      erro: 'Token de acesso não informado.'
    });
  }

  try {
    const dados = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.usuario = {
      id: dados.id,
      uuid: dados.uuid,
      nome: dados.nome,
      email: dados.email,
      perfil: dados.perfil
    };

    next();
  } catch (erro) {
    return res.status(401).json({
      erro: 'Token inválido ou expirado.'
    });
  }
}

function permitirPerfis(...perfisPermitidos) {
  return function verificarPerfil(req, res, next) {
    if (!req.usuario) {
      return res.status(401).json({
        erro: 'Usuário não autenticado.'
      });
    }

    if (!perfisPermitidos.includes(req.usuario.perfil)) {
      return res.status(403).json({
        erro: 'Você não possui permissão para esta ação.'
      });
    }

    next();
  };
}

module.exports = {
  autenticar,
  permitirPerfis
};