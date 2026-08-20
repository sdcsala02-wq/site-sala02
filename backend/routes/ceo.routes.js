const express = require("express");

const {
  autenticar,
  protegerCsrf
} = require(
  "../middlewares/auth.middleware"
);

const {
  resumo,
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  redefinirSenha,
  alterarStatus
} = require(
  "../controllers/ceo.controller"
);

const router = express.Router();

function somenteCEO(req, res, next) {
  if (
    !req.usuario ||
    String(req.usuario.perfil || "")
      .toUpperCase() !== "CEO"
  ) {
    return res.status(403).json({
      erro:
        "Acesso exclusivo da Central CEO."
    });
  }

  return next();
}

router.use(
  autenticar,
  somenteCEO
);

router.get(
  "/resumo",
  resumo
);

router.get(
  "/usuarios",
  listarUsuarios
);

router.post(
  "/usuarios",
  protegerCsrf,
  criarUsuario
);

router.put(
  "/usuarios/:id",
  protegerCsrf,
  atualizarUsuario
);

router.put(
  "/usuarios/:id/senha",
  protegerCsrf,
  redefinirSenha
);

router.patch(
  "/usuarios/:id/status",
  protegerCsrf,
  alterarStatus
);

module.exports = router;
