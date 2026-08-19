const express = require("express");

const {
  cadastro
} = require("../controllers/cadastro.controller");

const router = express.Router();

router.post("/cadastro", cadastro);

module.exports = router;
