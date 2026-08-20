const express = require("express");

const {
  login,
  logout,
  usuarioAtual
} = require(
  "../controllers/auth.controller"
);

const {
  autenticar,
  gerarTokenCsrf
} = require(
  "../middlewares/auth.middleware"
);

const router =
  express.Router();

router.post(
  "/login",
  login
);

router.post(
  "/logout",
  autenticar,
  logout
);

router.get(
  "/me",
  autenticar,
  usuarioAtual
);

router.get(
  "/csrf",
  autenticar,
  (req, res) => {
    const token =
      gerarTokenCsrf(
        req.tokenAutenticacao
      );

    if (!token) {
      return res
        .status(500)
        .json({
          erro:
            "Nao foi possivel gerar o token CSRF."
        });
    }

    res.set(
      "Cache-Control",
      "no-store"
    );

    return res.json({
      csrf_token: token
    });
  }
);

module.exports = router;