const express = require("express");

const {
  listarProcessos,
  detalharProcesso,
  listarDocumentos
} = require("../controllers/portal.controller");

const {
  autenticar,
  permitirPerfis
} = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(
  autenticar,
  permitirPerfis("CLIENTE")
);

router.get(
  "/processos",
  listarProcessos
);

router.get(
  "/processos/:id",
  detalharProcesso
);

router.get(
  "/documentos",
  listarDocumentos
);

module.exports = router;