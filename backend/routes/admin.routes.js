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
  autenticar,
  permitirPerfis
} = require(
  "../middlewares/auth.middleware"
);

const router = express.Router();

router.use(
  autenticar,
  permitirPerfis(
    "CEO",
    "ADMIN"
  )
);

router.use((req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store"
  );

  next();
});

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

module.exports = router;