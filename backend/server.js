require("dotenv").config();

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const nodemailer = require("nodemailer");

const app = express();

app.use(cors({
  origin: "https://www.sdcsala02.com.br",
  credentials: true
}));

app.use(helmet());
app.use(express.json({ limit: "2mb" }));

const JWT_SECRET = process.env.JWT_SECRET || "SALA02_SUPER_SEGURA_2026";
const CEO_USUARIO = process.env.CEO_USUARIO || "ceo";
const CEO_SENHA = process.env.CEO_SENHA || "123456";
const CEO_SENHA_HASH = bcrypt.hashSync(CEO_SENHA, 10);

const RECAPTCHA_ATIVO = process.env.RECAPTCHA_ATIVO === "true";
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || "";

const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASS = process.env.EMAIL_PASS || "";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

const db = new sqlite3.Database("./database.db");

const pastaUploads = path.join(__dirname, "uploads");

if (!fs.existsSync(pastaUploads)) {
  fs.mkdirSync(pastaUploads);
}

app.use("/uploads", express.static(pastaUploads));

// =======================
// LIMITADORES
// =======================

const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { erro: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }
});

const limitarCadastro = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { erro: "Muitas tentativas de cadastro. Aguarde e tente novamente." }
});

const limitarRecuperacao = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { sucesso: false, mensagem: "Muitas tentativas de recuperação. Aguarde 15 minutos." }
});

// =======================
// BANCO DE DADOS
// =======================

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT UNIQUE,
      cnpj TEXT UNIQUE,
      email TEXT,
      telefone TEXT,
      documento_tipo TEXT,
      senha TEXT NOT NULL,
      token_recuperacao TEXT,
      token_expira INTEGER,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS processos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      tipo TEXT,
      status TEXT,
      descricao TEXT,
      data TEXT,
      FOREIGN KEY(cliente_id) REFERENCES clientes(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      processo_id INTEGER,
      acao TEXT,
      data TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logs_acesso (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      usuario TEXT,
      ip TEXT,
      sucesso INTEGER,
      mensagem TEXT,
      data TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      processo_id INTEGER,
      nome_original TEXT,
      nome_arquivo TEXT,
      caminho TEXT,
      tipo TEXT,
      tamanho INTEGER,
      data TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY(cliente_id) REFERENCES clientes(id)
    )
  `);

  db.run(`ALTER TABLE clientes ADD COLUMN cnpj TEXT`, () => { });
  db.run(`ALTER TABLE clientes ADD COLUMN email TEXT`, () => { });
  db.run(`ALTER TABLE clientes ADD COLUMN telefone TEXT`, () => { });
  db.run(`ALTER TABLE clientes ADD COLUMN documento_tipo TEXT`, () => { });
  db.run(`ALTER TABLE clientes ADD COLUMN criado_em TEXT`, () => { });
  db.run(`ALTER TABLE clientes ADD COLUMN token_recuperacao TEXT`, () => { });
  db.run(`ALTER TABLE clientes ADD COLUMN token_expira INTEGER`, () => { });
});

// =======================
// FUNÇÕES
// =======================

function limparNumeros(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function validarCPF(cpf) {
  cpf = limparNumeros(cpf);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  let resto;

  for (let i = 1; i <= 9; i++) {
    soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }

  resto = (soma * 10) % 11;

  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(9, 10))) return false;

  soma = 0;

  for (let i = 1; i <= 10; i++) {
    soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }

  resto = (soma * 10) % 11;

  if (resto === 10 || resto === 11) resto = 0;

  return resto === parseInt(cpf.substring(10, 11));
}

function validarCNPJ(cnpj) {
  cnpj = limparNumeros(cnpj);

  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  let digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;

    if (pos < 2) pos = 9;
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;

  if (resultado !== parseInt(digitos.charAt(0))) return false;

  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;

    if (pos < 2) pos = 9;
  }

  resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;

  return resultado === parseInt(digitos.charAt(1));
}

function validarSenhaForte(senha) {
  if (!senha || senha.length < 8) return false;
  if (!/[A-Z]/.test(senha)) return false;
  if (!/[a-z]/.test(senha)) return false;
  if (!/[0-9]/.test(senha)) return false;
  if (!/[^A-Za-z0-9]/.test(senha)) return false;

  return true;
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function registrarLog(tipo, usuario, ip, sucesso, mensagem) {
  db.run(
    `INSERT INTO logs_acesso (tipo, usuario, ip, sucesso, mensagem)
     VALUES (?, ?, ?, ?, ?)`,
    [tipo, usuario || "", ip || "", sucesso ? 1 : 0, mensagem || ""]
  );
}

async function validarRecaptcha(token) {
  if (!RECAPTCHA_ATIVO) return true;
  if (!token) return false;

  try {
    const resposta = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `secret=${RECAPTCHA_SECRET_KEY}&response=${token}`
    });

    const data = await resposta.json();

    return data.success === true;
  } catch (error) {
    return false;
  }
}

function gerarTokenRecuperacao() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function enviarEmailRecuperacao(destinatario, nome, token) {
  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error("E-mail do sistema não configurado no .env.");
  }

  await transporter.sendMail({
    from: `"Sala 02" <${EMAIL_USER}>`,
    to: destinatario,
    subject: "Token de redefinição de senha - Sala 02",
    html: `
      <div style="font-family:Arial,sans-serif;background:#f4efe7;padding:30px;">
        <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #ddd;">
          <h2 style="color:#071f3d;margin-bottom:10px;">SALA 02</h2>
          <p>Olá, ${nome || "cliente"}.</p>
          <p>Recebemos uma solicitação para redefinir sua senha.</p>
          <p>Seu token de segurança é:</p>
          <div style="font-size:34px;font-weight:900;letter-spacing:6px;color:#071f3d;background:#f4efe7;padding:18px;text-align:center;border-radius:12px;">
            ${token}
          </div>
          <p style="margin-top:20px;">Este token expira em 15 minutos.</p>
          <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
        </div>
      </div>
    `
  });
}

// =======================
// TOKENS JWT
// =======================

function gerarTokenCEO() {
  return jwt.sign(
    { usuario: CEO_USUARIO, perfil: "CEO" },
    JWT_SECRET,
    { expiresIn: "4h" }
  );
}

function gerarTokenCliente(cliente) {
  return jwt.sign(
    {
      id: cliente.id,
      nome: cliente.nome,
      cpf: cliente.cpf,
      cnpj: cliente.cnpj,
      perfil: "CLIENTE"
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function autenticarCEO(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ erro: "Token não enviado." });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.perfil !== "CEO") {
      return res.status(403).json({ erro: "Acesso negado." });
    }

    req.usuario = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}

function autenticarCliente(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ erro: "Token não enviado." });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.perfil !== "CLIENTE") {
      return res.status(403).json({ erro: "Acesso negado." });
    }

    req.cliente = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}

// =======================
// UPLOAD
// =======================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, pastaUploads);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const nomeSeguro = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;

    cb(null, nomeSeguro);
  }
});

function filtroArquivos(req, file, cb) {
  const permitidos = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!permitidos.includes(file.mimetype)) {
    return cb(new Error("Tipo de arquivo não permitido. Envie PDF, JPG, PNG ou WEBP."));
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter: filtroArquivos,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// =======================
// CADASTRAR CLIENTE
// =======================

app.post("/clientes", limitarCadastro, async (req, res) => {
  try {
    const { nome, cpf, cnpj, email, telefone, senha, recaptchaToken } = req.body;

    const recaptchaOk = await validarRecaptcha(recaptchaToken);

    if (!recaptchaOk) {
      return res.status(403).json({ erro: "Falha na verificação de segurança." });
    }

    if (!nome || !senha) {
      return res.status(400).json({ erro: "Preencha nome e senha." });
    }

    const cpfLimpo = limparNumeros(cpf);
    const cnpjLimpo = limparNumeros(cnpj);
    const telefoneLimpo = limparNumeros(telefone);
    const emailLimpo = String(email || "").trim().toLowerCase();

    if (!cpfLimpo && !cnpjLimpo) {
      return res.status(400).json({ erro: "Informe CPF ou CNPJ." });
    }

    if (cpfLimpo && !validarCPF(cpfLimpo)) {
      return res.status(400).json({ erro: "CPF inválido ou inexistente." });
    }

    if (cnpjLimpo && !validarCNPJ(cnpjLimpo)) {
      return res.status(400).json({ erro: "CNPJ inválido ou inexistente." });
    }

    if (emailLimpo && !validarEmail(emailLimpo)) {
      return res.status(400).json({ erro: "E-mail inválido." });
    }

    if (!validarSenhaForte(senha)) {
      return res.status(400).json({
        erro: "A senha deve ter no mínimo 8 caracteres, letra maiúscula, minúscula, número e símbolo."
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const documentoTipo = cnpjLimpo ? "CNPJ" : "CPF";

    db.run(
      `INSERT INTO clientes 
      (nome, cpf, cnpj, email, telefone, documento_tipo, senha, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
      [
        nome.trim(),
        cpfLimpo || null,
        cnpjLimpo || null,
        emailLimpo || null,
        telefoneLimpo || null,
        documentoTipo,
        senhaHash
      ],
      function (err) {
        if (err) {
          return res.status(409).json({ erro: "CPF ou CNPJ já cadastrado." });
        }

        registrarLog("CADASTRO_CLIENTE", nome, req.ip, true, "Cliente cadastrado.");

        res.json({
          id: this.lastID,
          nome: nome.trim(),
          cpf: cpfLimpo || null,
          cnpj: cnpjLimpo || null,
          email: emailLimpo || null,
          telefone: telefoneLimpo || null,
          documento_tipo: documentoTipo
        });
      }
    );

  } catch (error) {
    res.status(500).json({ erro: "Erro interno ao cadastrar cliente." });
  }
});

// =======================
// LOGIN CLIENTE
// =======================

app.post("/login", limitarLogin, async (req, res) => {
  const { documento, cpf, cnpj, senha, recaptchaToken } = req.body;

  const recaptchaOk = await validarRecaptcha(recaptchaToken);

  if (!recaptchaOk) {
    return res.status(403).json({ erro: "Falha na verificação de segurança." });
  }

  if ((!documento && !cpf && !cnpj) || !senha) {
    return res.status(400).json({ erro: "Informe CPF/CNPJ e senha." });
  }

  const docLimpo = limparNumeros(documento || cpf || cnpj);

  db.get(
    "SELECT * FROM clientes WHERE cpf = ? OR cnpj = ?",
    [docLimpo, docLimpo],
    async (err, cliente) => {
      if (err) {
        registrarLog("LOGIN_CLIENTE", docLimpo, req.ip, false, "Erro no servidor.");
        return res.status(500).json({ erro: "Erro no servidor." });
      }

      if (!cliente) {
        registrarLog("LOGIN_CLIENTE", docLimpo, req.ip, false, "Documento não encontrado.");
        return res.status(401).json({ erro: "CPF/CNPJ ou senha inválidos." });
      }

      const senhaOk = await bcrypt.compare(senha, cliente.senha);

      if (!senhaOk) {
        registrarLog("LOGIN_CLIENTE", docLimpo, req.ip, false, "Senha incorreta.");
        return res.status(401).json({ erro: "CPF/CNPJ ou senha inválidos." });
      }

      const token = gerarTokenCliente(cliente);

      registrarLog("LOGIN_CLIENTE", cliente.nome, req.ip, true, "Login realizado.");

      res.json({
        id: cliente.id,
        nome: cliente.nome,
        cpf: cliente.cpf,
        cnpj: cliente.cnpj,
        email: cliente.email,
        telefone: cliente.telefone,
        documento_tipo: cliente.documento_tipo,
        token
      });
    }
  );
});

// =======================
// RECUPERAR SENHA
// =======================

app.post("/recuperar-senha", limitarRecuperacao, async (req, res) => {
  try {
    const { identificador } = req.body;

    if (!identificador) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe CPF, CNPJ ou e-mail cadastrado."
      });
    }

    const texto = String(identificador).trim().toLowerCase();
    const numeros = limparNumeros(identificador);

    db.get(
      `SELECT * FROM clientes 
       WHERE cpf = ? OR cnpj = ? OR lower(email) = ?`,
      [numeros, numeros, texto],
      async (err, cliente) => {
        if (err) {
          return res.status(500).json({
            sucesso: false,
            mensagem: "Erro interno ao buscar cadastro."
          });
        }

        if (!cliente) {
          registrarLog("RECUPERAR_SENHA", identificador, req.ip, false, "Cadastro não encontrado.");

          return res.json({
            sucesso: false,
            mensagem: "Cadastro não encontrado."
          });
        }

        if (!cliente.email) {
          return res.json({
            sucesso: false,
            mensagem: "Este cadastro não possui e-mail cadastrado."
          });
        }

        const token = gerarTokenRecuperacao();
        const expira = Date.now() + 15 * 60 * 1000;

        db.run(
          `UPDATE clientes 
           SET token_recuperacao = ?, token_expira = ?
           WHERE id = ?`,
          [token, expira, cliente.id],
          async (updateErr) => {
            if (updateErr) {
              return res.status(500).json({
                sucesso: false,
                mensagem: "Erro ao gerar token."
              });
            }

            try {
              await enviarEmailRecuperacao(cliente.email, cliente.nome, token);

              registrarLog("RECUPERAR_SENHA", cliente.nome, req.ip, true, "Token enviado por e-mail.");

              return res.json({
                sucesso: true,
                mensagem: "Token enviado com sucesso para o e-mail cadastrado."
              });

            } catch (emailErr) {
              return res.status(500).json({
                sucesso: false,
                mensagem: "Erro ao enviar e-mail. Verifique EMAIL_USER e EMAIL_PASS no .env."
              });
            }
          }
        );
      }
    );

  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro interno na recuperação de senha."
    });
  }
});

// =======================
// REDEFINIR SENHA
// =======================

app.post("/redefinir-senha", async (req, res) => {
  try {
    const { token, novaSenha } = req.body;

    if (!token || !novaSenha) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe o token e a nova senha."
      });
    }

    if (!validarSenhaForte(novaSenha)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "A nova senha deve ter no mínimo 8 caracteres, letra maiúscula, minúscula, número e símbolo."
      });
    }

    db.get(
      `SELECT * FROM clientes 
       WHERE token_recuperacao = ? AND token_expira > ?`,
      [String(token).trim(), Date.now()],
      async (err, cliente) => {
        if (err) {
          return res.status(500).json({
            sucesso: false,
            mensagem: "Erro interno ao validar token."
          });
        }

        if (!cliente) {
          return res.status(400).json({
            sucesso: false,
            mensagem: "Token inválido ou expirado."
          });
        }

        const senhaHash = await bcrypt.hash(novaSenha, 10);

        db.run(
          `UPDATE clientes
           SET senha = ?, token_recuperacao = NULL, token_expira = NULL
           WHERE id = ?`,
          [senhaHash, cliente.id],
          function (updateErr) {
            if (updateErr) {
              return res.status(500).json({
                sucesso: false,
                mensagem: "Erro ao redefinir senha."
              });
            }

            registrarLog("REDEFINIR_SENHA", cliente.nome, req.ip, true, "Senha redefinida.");

            return res.json({
              sucesso: true,
              mensagem: "Senha redefinida com sucesso."
            });
          }
        );
      }
    );

  } catch (error) {
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro interno ao redefinir senha."
    });
  }
});

// =======================
// LOGIN CEO
// =======================

app.post("/login-ceo", limitarLogin, async (req, res) => {
  try {
    const { usuario, senha, recaptchaToken } = req.body;

    const recaptchaOk = await validarRecaptcha(recaptchaToken);

    if (!recaptchaOk) {
      return res.status(403).json({ erro: "Falha na verificação de segurança." });
    }

    if (!usuario || !senha) {
      return res.status(400).json({ erro: "Informe usuário e senha." });
    }

    if (usuario !== CEO_USUARIO) {
      registrarLog("LOGIN_CEO", usuario, req.ip, false, "Usuário inválido.");
      return res.status(401).json({ erro: "Usuário ou senha inválidos." });
    }

    const senhaOk = await bcrypt.compare(senha, CEO_SENHA_HASH);

    if (!senhaOk) {
      registrarLog("LOGIN_CEO", usuario, req.ip, false, "Senha inválida.");
      return res.status(401).json({ erro: "Usuário ou senha inválidos." });
    }

    const token = gerarTokenCEO();

    registrarLog("LOGIN_CEO", usuario, req.ip, true, "Login CEO realizado.");

    res.json({ token });

  } catch (error) {
    res.status(500).json({ erro: "Erro interno no login CEO." });
  }
});

app.put("/meu-email", autenticarCliente, (req, res) => {
  const { email } = req.body;

  if (!email || !validarEmail(email)) {
    return res.status(400).json({ erro: "Informe um e-mail válido." });
  }

  const emailLimpo = email.trim().toLowerCase();

  db.run(
    "UPDATE clientes SET email = ? WHERE id = ?",
    [emailLimpo, req.cliente.id],
    function (err) {
      if (err) {
        return res.status(500).json({ erro: "Erro ao atualizar e-mail." });
      }

      registrarLog("ALTERAR_EMAIL", req.cliente.nome, req.ip, true, "E-mail atualizado.");

      res.json({
        sucesso: true,
        email: emailLimpo,
        mensagem: "E-mail atualizado com sucesso."
      });
    }
  );
});

// =======================
// LISTAR CLIENTES
// =======================

app.get("/clientes", autenticarCEO, (req, res) => {
  db.all(
    "SELECT id, nome, cpf, cnpj, email, telefone, documento_tipo, criado_em FROM clientes ORDER BY id DESC",
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ erro: "Erro ao listar clientes." });
      }

      res.json(rows);
    }
  );
});

// =======================
// PROCESSOS
// =======================

app.get("/processos", autenticarCEO, (req, res) => {
  db.all(
    `SELECT 
      processos.id,
      processos.cliente_id,
      processos.tipo,
      processos.status,
      processos.descricao,
      processos.data,
      clientes.nome AS cliente_nome,
      clientes.cpf AS cliente_cpf,
      clientes.cnpj AS cliente_cnpj
    FROM processos
    INNER JOIN clientes ON clientes.id = processos.cliente_id
    ORDER BY processos.id DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ erro: "Erro ao listar processos." });
      }

      res.json(rows);
    }
  );
});

app.post("/processos", autenticarCEO, (req, res) => {
  const { cliente_id, tipo, status, descricao } = req.body;

  if (!cliente_id || !tipo || !status || !descricao) {
    return res.status(400).json({ erro: "Preencha todos os dados do processo." });
  }

  db.run(
    `INSERT INTO processos (cliente_id, tipo, status, descricao, data)
     VALUES (?, ?, ?, ?, datetime('now', 'localtime'))`,
    [cliente_id, tipo, status, descricao],
    function (err) {
      if (err) {
        return res.status(500).json({ erro: "Erro ao criar processo." });
      }

      const processoId = this.lastID;

      db.run(
        "INSERT INTO historico (processo_id, acao, data) VALUES (?, ?, datetime('now', 'localtime'))",
        [processoId, "Processo criado com status: " + status]
      );

      registrarLog("CRIAR_PROCESSO", req.usuario.usuario, req.ip, true, "Processo criado.");

      res.json({ id: processoId });
    }
  );
});

app.get("/processos/:id", (req, res) => {
  db.all(
    "SELECT * FROM processos WHERE cliente_id = ? ORDER BY id DESC",
    [req.params.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ erro: "Erro ao buscar processos." });
      }

      res.json(rows);
    }
  );
});

app.put("/processos/:id", autenticarCEO, (req, res) => {
  const processoId = req.params.id;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ erro: "Informe o novo status." });
  }

  db.run(
    "UPDATE processos SET status = ?, data = datetime('now', 'localtime') WHERE id = ?",
    [status, processoId],
    function (err) {
      if (err) {
        return res.status(500).json({ erro: "Erro ao atualizar status." });
      }

      if (this.changes === 0) {
        return res.status(404).json({ erro: "Processo não encontrado." });
      }

      db.run(
        "INSERT INTO historico (processo_id, acao, data) VALUES (?, ?, datetime('now', 'localtime'))",
        [processoId, "Status alterado para: " + status]
      );

      registrarLog("ATUALIZAR_STATUS", req.usuario.usuario, req.ip, true, "Status atualizado.");

      res.json({
        atualizado: true,
        id: processoId,
        status
      });
    }
  );
});

// =======================
// HISTÓRICO
// =======================

app.get("/historico/:processoId", autenticarCEO, (req, res) => {
  db.all(
    "SELECT * FROM historico WHERE processo_id = ? ORDER BY id DESC",
    [req.params.processoId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ erro: "Erro ao buscar histórico." });
      }

      res.json(rows);
    }
  );
});

// =======================
// DOCUMENTOS
// =======================

app.post("/documentos", autenticarCliente, upload.single("documento"), (req, res) => {
  try {
    const { processo_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ erro: "Nenhum arquivo enviado." });
    }

    db.run(
      `INSERT INTO documentos 
      (cliente_id, processo_id, nome_original, nome_arquivo, caminho, tipo, tamanho)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.cliente.id,
        processo_id || null,
        req.file.originalname,
        req.file.filename,
        "/uploads/" + req.file.filename,
        req.file.mimetype,
        req.file.size
      ],
      function (err) {
        if (err) {
          return res.status(500).json({ erro: "Erro ao salvar documento." });
        }

        registrarLog("UPLOAD_DOCUMENTO", req.cliente.nome, req.ip, true, "Documento enviado.");

        res.json({
          id: this.lastID,
          mensagem: "Documento enviado com segurança.",
          arquivo: req.file.filename
        });
      }
    );

  } catch (error) {
    res.status(500).json({ erro: "Erro no upload." });
  }
});

app.get("/meus-documentos", autenticarCliente, (req, res) => {
  db.all(
    "SELECT * FROM documentos WHERE cliente_id = ? ORDER BY id DESC",
    [req.cliente.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ erro: "Erro ao buscar documentos." });
      }

      res.json(rows);
    }
  );
});

app.get("/documentos", autenticarCEO, (req, res) => {
  db.all(
    `SELECT 
      documentos.*,
      clientes.nome AS cliente_nome,
      clientes.cpf AS cliente_cpf,
      clientes.cnpj AS cliente_cnpj
    FROM documentos
    INNER JOIN clientes ON clientes.id = documentos.cliente_id
    ORDER BY documentos.id DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ erro: "Erro ao listar documentos." });
      }

      res.json(rows);
    }
  );
});

// =======================
// LOGS
// =======================

app.get("/logs", autenticarCEO, (req, res) => {
  db.all(
    "SELECT * FROM logs_acesso ORDER BY id DESC LIMIT 200",
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ erro: "Erro ao buscar logs." });
      }

      res.json(rows);
    }
  );
});

// =======================
// TESTE
// =======================

app.get("/", (req, res) => {
  res.json({
    sistema: "Sala 02",
    status: "online",
    banco: "SQLite ativo em database.db",
    email: EMAIL_USER ? "configurado" : "não configurado",
    seguranca: "CPF, CNPJ, senha forte, token, logs, rate limit, recuperação por e-mail e upload seguro ativos"
  });
});

// =======================
// INICIAR
// =======================

app.put("/meu-email", autenticarCliente, (req, res) => {

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      erro: "Informe um e-mail."
    });
  }

  const emailLimpo = email.trim().toLowerCase();

  db.run(
    `
    UPDATE clientes
    SET email = ?
    WHERE id = ?
    `,
    [emailLimpo, req.cliente.id],

    function (err) {

      if (err) {
        console.log(err);

        return res.status(500).json({
          erro: "Erro ao atualizar e-mail."
        });
      }

      res.json({
        sucesso: true,
        email: emailLimpo
      });

    }
  );

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 SISTEMA SALA 02 RODANDO: https://site-sala02-production.up.railway.app");
  console.log("📁 Banco de dados: database.db");
  console.log("🔐 Segurança ativada");
  console.log("📧 Recuperação por e-mail:", EMAIL_USER ? "configurada" : "não configurada");
});