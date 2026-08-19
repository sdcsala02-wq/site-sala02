const express = require("express");

const {
  login,
  logout,
  usuarioAtual
} = require("../controllers/auth.controller");

const {
  autenticar
} = require("../middlewares/auth.middleware");

const router = express.Router();

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

module.exports = router;