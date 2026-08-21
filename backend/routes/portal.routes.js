const express = require("express");

const {
  listarProcessos,
  detalharProcesso,
  listarDocumentos
} = require(
  "../controllers/portal.controller"
);

const {
  receberDocumento,
  enviarDocumento,
  baixarDocumento
} = require(
  "../controllers/documentos.controller"
);

const {
  autenticar,
  permitirPerfis,
  protegerCsrf
} = require(
  "../middlewares/auth.middleware"
);

const router =
  express.Router();


router.use(
  autenticar,
  permitirPerfis(
    "CLIENTE"
  )
);


router.use(
  (req, res, next) => {

    res.set(
      "Cache-Control",
      "no-store"
    );

    next();
  }
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


router.post(
  "/documentos",
  protegerCsrf,
  receberDocumento,
  enviarDocumento
);


router.get(
  "/documentos/:id/download",
  baixarDocumento
);


module.exports =
  router;