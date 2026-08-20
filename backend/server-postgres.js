require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const pool = require("./config/database");
const authRoutes = require("./routes/auth.routes");
const publicRoutes = require("./routes/public.routes");
const portalRoutes = require("./routes/portal.routes");
const adminRoutes = require("./routes/admin.routes");
const ceoRoutes = require("./routes/ceo.routes");

const app = express();

const origensPermitidas = [
  "https://www.sdcsala02.com.br",
  "https://sdcsala02.com.br",
  "https://site-sala02-production.up.railway.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];

app.set("trust proxy", 1);

app.use(
  cors({
    origin(origem, callback) {
      if (
        !origem ||
        origensPermitidas.includes(origem)
      ) {
        return callback(null, true);
      }

      return callback(
        new Error(
          "Origem nao autorizada pelo CORS."
        )
      );
    },

    credentials: true
  })
);

app.use(helmet());

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    erro:
      "Muitas tentativas. Aguarde 15 minutos."
  }
});

const limitarCadastro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    erro:
      "Muitas tentativas de cadastro. Tente novamente mais tarde."
  }
});

app.use(
  "/api/auth/login",
  limitarLogin
);

app.use(
  "/api/public/cadastro",
  limitarCadastro
);

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/public",
  publicRoutes
);

app.use(
  "/api/portal",
  portalRoutes
);

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/ceo",
  ceoRoutes
);

app.get("/", async (req, res) => {
  try {
    const resultado =
      await pool.query(`
        SELECT
          NOW() AS horario,
          current_database() AS banco
      `);

    return res.json({
      sistema: "Sala 02 SDC",
      status: "online",
      banco: "PostgreSQL",
      conexao: resultado.rows[0]
    });

  } catch (erro) {
    console.error(
      "Erro no teste do banco:",
      erro.message
    );

    return res.status(500).json({
      sistema: "Sala 02 SDC",
      status: "erro",
      banco:
        "PostgreSQL indisponivel"
    });
  }
});


// PREVIEW_CEO_STATIC_ROUTES
const previewCeoPublico = path.join(
  __dirname,
  "public-preview"
);

app.use(
  express.static(
    previewCeoPublico,
    {
      index: false,
      dotfiles: "deny",
      fallthrough: true,
      etag: true,
      maxAge: 0
    }
  )
);
app.use((req, res) => {
  return res.status(404).json({
    erro: "Rota nao encontrada."
  });
});

app.use((erro, req, res, next) => {
  console.error(
    "Erro nao tratado:",
    erro
  );

  return res.status(500).json({
    erro:
      "Erro interno do servidor."
  });
});

const PORT =
  Number(process.env.PORT) || 3000;

const servidor =
  app.listen(PORT, () => {
    console.log(
      "===================================="
    );

    console.log(
      `SALA 02 POSTGRES RODANDO NA PORTA ${PORT}`
    );

    console.log(
      "Rota: POST /api/auth/login"
    );

    console.log(
      "Rota: GET /api/auth/me"
    );

    console.log(
      "Rota: POST /api/public/cadastro"
    );

    console.log(
      "Rota: GET /api/portal/processos"
    );

    console.log(
      "Rota: GET /api/portal/processos/:id"
    );

    console.log(
      "Rota: GET /api/portal/documentos"
    );

    console.log(
      "===================================="
    );
  });

async function encerrarServidor(sinal) {
  console.log(
    `\n${sinal} recebido. Encerrando...`
  );

  servidor.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on(
  "SIGINT",
  () => encerrarServidor("SIGINT")
);

process.on(
  "SIGTERM",
  () => encerrarServidor("SIGTERM")
);
