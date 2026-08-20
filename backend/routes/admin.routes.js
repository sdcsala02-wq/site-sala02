const express = require("express");

const {
  resumo,
  listarClientes,
  listarProcessos,
  listarProcessosCliente
} = require(
  "../controllers/admin.controller"
);

const {
  criarProcesso,
  atualizarStatusProcesso,
  ativarCliente
} = require(
  "../controllers/admin-write.controller"
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
    "CEO",
    "ADMIN"
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
  "/resumo",
  resumo
);

router.get(
  "/clientes",
  listarClientes
);

router.get(
  "/processos",
  listarProcessos
);

router.get(
  "/clientes/:id/processos",
  listarProcessosCliente
);

router.patch(
  "/clientes/:id/ativar",
  protegerCsrf,
  ativarCliente
);

router.post(
  "/processos",
  protegerCsrf,
  criarProcesso
);

router.patch(
  "/processos/:id/status",
  protegerCsrf,
  atualizarStatusProcesso
);

module.exports = router;