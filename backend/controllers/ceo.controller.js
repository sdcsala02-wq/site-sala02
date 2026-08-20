const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const pool = require("../config/database");

const {
  registrarAuditoria
} = require("../services/auditoria.service");

function somenteNumeros(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(valor || "").trim()
  );
}

function validarCPF(valor) {
  const cpf = somenteNumeros(valor);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;

  for (let i = 0; i < 9; i++) {
    soma += Number(cpf[i]) * (10 - i);
  }

  let digito1 = 11 - (soma % 11);
  if (digito1 >= 10) digito1 = 0;

  if (digito1 !== Number(cpf[9])) {
    return false;
  }

  soma = 0;

  for (let i = 0; i < 10; i++) {
    soma += Number(cpf[i]) * (11 - i);
  }

  let digito2 = 11 - (soma % 11);
  if (digito2 >= 10) digito2 = 0;

  return digito2 === Number(cpf[10]);
}

function validarCNPJ(valor) {
  const cnpj = somenteNumeros(valor);

  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  function calcularDigito(base, pesos) {
    let soma = 0;

    for (let i = 0; i < pesos.length; i++) {
      soma += Number(base[i]) * pesos[i];
    }

    const resto = soma % 11;

    return resto < 2
      ? 0
      : 11 - resto;
  }

  const primeiro = calcularDigito(
    cnpj.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  if (primeiro !== Number(cnpj[12])) {
    return false;
  }

  const segundo = calcularDigito(
    cnpj.slice(0, 13),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  return segundo === Number(cnpj[13]);
}


// CADASTRO_SEGURO_BACKEND_V2

function validarCadastroCritico(body) {
  const cpfRaw =
    String(
      body.cpf || ""
    ).trim();

  if (
    !/^[0-9.\-\s]+$/
      .test(cpfRaw) ||
    !validarCPF(cpfRaw)
  ) {
    return "CPF inválido.";
  }

  const telefoneRaw =
    String(
      body.telefone || ""
    ).trim();

  if (telefoneRaw) {
    if (
      !/^[0-9()\s+\-]+$/
        .test(telefoneRaw)
    ) {
      return "Telefone contém caracteres inválidos.";
    }

    const telefone =
      somenteNumeros(
        telefoneRaw
      );

    if (
      telefone.length !== 10 &&
      telefone.length !== 11
    ) {
      return "Telefone inválido. Informe DDD e número.";
    }
  }

  const cnpjRaw =
    String(
      body.cnpj || ""
    ).trim();

  if (cnpjRaw) {
    if (
      !/^[0-9.\/\-\s]+$/
        .test(cnpjRaw) ||
      !validarCNPJ(cnpjRaw)
    ) {
      return "CNPJ inválido.";
    }
  }

  const im =
    String(
      body.inscricao_municipal || ""
    ).trim();

  if (
    im &&
    !/^\d{4}\/\d{2}$/
      .test(im)
  ) {
    return "Inscrição Municipal inválida. Use o padrão 0000/00.";
  }

  return null;
}

function senhaForte(senha) {
  const valor = String(senha || "");

  return (
    valor.length >= 10 &&
    /[a-z]/.test(valor) &&
    /[A-Z]/.test(valor) &&
    /\d/.test(valor)
  );
}

async function auditar(req, dados) {
  try {
    await registrarAuditoria({
      usuarioId: req.usuario.id,
      acao: dados.acao,
      entidade: dados.entidade,
      entidadeId: dados.entidadeId || null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      dadosNovos: dados.dadosNovos || null
    });
  } catch (erro) {
    console.error(
      "Falha ao registrar auditoria CEO:",
      erro
    );
  }
}

function tratarErro(res, erro, contexto) {
  console.error(contexto, erro);

  if (erro && erro.code === "23505") {
    return res.status(409).json({
      erro:
        "Já existe um cadastro com CPF, CNPJ ou e-mail informado."
    });
  }

  return res.status(500).json({
    erro: "Erro interno na Central CEO."
  });
}

async function resumo(req, res) {
  try {
    const resultado = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int
         FROM usuarios) AS usuarios_total,

        (SELECT COUNT(*)::int
         FROM usuarios
         WHERE status = 'ATIVO')
           AS usuarios_ativos,

        (SELECT COUNT(*)::int
         FROM usuarios
         WHERE status <> 'ATIVO')
           AS usuarios_inativos,

        (SELECT COUNT(*)::int
         FROM usuarios
         WHERE perfil = 'CLIENTE')
           AS usuarios_clientes,

        (SELECT COUNT(*)::int
         FROM clientes)
           AS clientes_total,

        (SELECT COUNT(*)::int
         FROM empresas)
           AS empresas_total,

        (SELECT COUNT(*)::int
         FROM processos)
           AS processos_total,

        (SELECT COUNT(*)::int
         FROM pendencias)
           AS pendencias_total
    `);

    return res.json(resultado.rows[0]);
  } catch (erro) {
    return tratarErro(
      res,
      erro,
      "Erro ao carregar resumo CEO:"
    );
  }
}

async function listarUsuarios(req, res) {
  try {
    const resultado = await pool.query(`
      SELECT
        u.id,
        u.uuid,
        u.nome,
        u.cpf,
        u.email,
        u.telefone,
        u.perfil,
        u.status,
        u.email_verificado,
        u.ultimo_login,
        u.criado_em,
        u.senha_alterada_em,

        c.id AS cliente_id,
        c.tipo_pessoa,

        e.id AS empresa_id,
        e.razao_social,
        e.nome_fantasia,
        e.cnpj,
        e.inscricao_municipal,
        e.inscricao_estadual,
        e.status AS empresa_status

      FROM usuarios u

      LEFT JOIN clientes c
        ON c.usuario_id = u.id

      LEFT JOIN LATERAL (
        SELECT
          id,
          razao_social,
          nome_fantasia,
          cnpj,
          inscricao_municipal,
          inscricao_estadual,
          status
        FROM empresas
        WHERE cliente_id = c.id
        ORDER BY id
        LIMIT 1
      ) e ON TRUE

      ORDER BY
        CASE
          WHEN u.perfil = 'CEO'
          THEN 0
          ELSE 1
        END,
        u.nome,
        u.id
    `);

    return res.json({
      usuarios: resultado.rows
    });
  } catch (erro) {
    return tratarErro(
      res,
      erro,
      "Erro ao listar usuarios CEO:"
    );
  }
}

async function criarUsuario(req, res) {
  const nome =
    String(req.body.nome || "").trim();

  const cpf =
    somenteNumeros(req.body.cpf);

  const email =
    String(req.body.email || "")
      .trim()
      .toLowerCase();

  const telefone =
    somenteNumeros(req.body.telefone);

  const senha =
    String(req.body.senha || "");

  const tipoPessoa =
    String(
      req.body.tipo_pessoa || "PF"
    ).toUpperCase();

  const cnpj =
    somenteNumeros(req.body.cnpj);

  const razaoSocial =
    String(
      req.body.razao_social || ""
    ).trim();

  const nomeFantasia =
    String(
      req.body.nome_fantasia || ""
    ).trim();

  const inscricaoMunicipal =
    String(
      req.body.inscricao_municipal || ""
    ).trim();

  const inscricaoEstadual =
    String(
      req.body.inscricao_estadual || ""
    ).trim();


  const erroCadastroCritico =
    validarCadastroCritico(
      req.body
    );

  if (erroCadastroCritico) {
    return res.status(400).json({
      erro: erroCadastroCritico
    });
  }

  if (nome.length < 3) {
    return res.status(400).json({
      erro: "Informe o nome completo."
    });
  }

  if (!validarCPF(cpf)) {
    return res.status(400).json({
      erro: "CPF inválido."
    });
  }

  if (!emailValido(email)) {
    return res.status(400).json({
      erro: "E-mail inválido."
    });
  }

  if (!senhaForte(senha)) {
    return res.status(400).json({
      erro:
        "A senha deve ter ao menos 10 caracteres, letra maiúscula, letra minúscula e número."
    });
  }

  if (!["PF", "PJ"].includes(tipoPessoa)) {
    return res.status(400).json({
      erro: "Tipo de pessoa inválido."
    });
  }

  if (
    tipoPessoa === "PJ" &&
    !validarCNPJ(cnpj)
  ) {
    return res.status(400).json({
      erro: "CNPJ inválido."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const senhaHash =
      await bcrypt.hash(senha, 12);

    const usuario = await client.query(
      `
        INSERT INTO usuarios (
          uuid,
          nome,
          cpf,
          email,
          telefone,
          senha_hash,
          perfil,
          status,
          email_verificado,
          senha_alterada_em
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'CLIENTE',
          'ATIVO',
          FALSE,
          NOW()
        )
        RETURNING
          id,
          uuid,
          nome,
          cpf,
          email,
          telefone,
          perfil,
          status
      `,
      [
        crypto.randomUUID(),
        nome,
        cpf,
        email,
        telefone || null,
        senhaHash
      ]
    );

    const usuarioCriado =
      usuario.rows[0];

    const cliente = await client.query(
      `
        INSERT INTO clientes (
          usuario_id,
          tipo_pessoa
        )
        VALUES ($1, $2)
        RETURNING id
      `,
      [
        usuarioCriado.id,
        tipoPessoa
      ]
    );

    const clienteId =
      cliente.rows[0].id;

    let empresaId = null;

    if (tipoPessoa === "PJ") {
      const empresa = await client.query(
        `
          INSERT INTO empresas (
            cliente_id,
            razao_social,
            nome_fantasia,
            cnpj,
            inscricao_municipal,
            inscricao_estadual,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'ATIVA'
          )
          RETURNING id
        `,
        [
          clienteId,
          razaoSocial || null,
          nomeFantasia || null,
          cnpj,
          inscricaoMunicipal || null,
          inscricaoEstadual || null
        ]
      );

      empresaId =
        empresa.rows[0].id;

      await client.query(
        `
          INSERT INTO empresa_usuarios (
            empresa_id,
            usuario_id,
            papel,
            status,
            aceito_em
          )
          VALUES (
            $1,
            $2,
            'TITULAR',
            'ATIVO',
            NOW()
          )
        `,
        [
          empresaId,
          usuarioCriado.id
        ]
      );
    }

    await client.query("COMMIT");

    await auditar(req, {
      acao: "CEO_CLIENTE_CRIADO",
      entidade: "usuarios",
      entidadeId: usuarioCriado.id,
      dadosNovos: {
        perfil: "CLIENTE",
        tipo_pessoa: tipoPessoa,
        empresa_id: empresaId
      }
    });

    return res.status(201).json({
      sucesso: true,
      mensagem:
        "Cliente criado com sucesso.",
      usuario_id: usuarioCriado.id,
      cliente_id: clienteId,
      empresa_id: empresaId
    });
  } catch (erro) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    return tratarErro(
      res,
      erro,
      "Erro ao criar cliente CEO:"
    );
  } finally {
    client.release();
  }
}

async function atualizarUsuario(req, res) {
  const id =
    Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: "Usuário inválido."
    });
  }

  const nome =
    String(req.body.nome || "").trim();

  const cpf =
    somenteNumeros(req.body.cpf);

  const email =
    String(req.body.email || "")
      .trim()
      .toLowerCase();

  const telefone =
    somenteNumeros(req.body.telefone);

  const cnpj =
    somenteNumeros(req.body.cnpj);

  const razaoSocial =
    String(
      req.body.razao_social || ""
    ).trim();

  const nomeFantasia =
    String(
      req.body.nome_fantasia || ""
    ).trim();

  const inscricaoMunicipal =
    String(
      req.body.inscricao_municipal || ""
    ).trim();

  const inscricaoEstadual =
    String(
      req.body.inscricao_estadual || ""
    ).trim();


  const erroCadastroCritico =
    validarCadastroCritico(
      req.body
    );

  if (erroCadastroCritico) {
    return res.status(400).json({
      erro: erroCadastroCritico
    });
  }

  if (nome.length < 3) {
    return res.status(400).json({
      erro: "Informe o nome completo."
    });
  }

  if (!validarCPF(cpf)) {
    return res.status(400).json({
      erro: "CPF inválido."
    });
  }

  if (!emailValido(email)) {
    return res.status(400).json({
      erro: "E-mail inválido."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const atual = await client.query(
      `
        SELECT
          id,
          perfil
        FROM usuarios
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (!atual.rowCount) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        erro: "Usuário não encontrado."
      });
    }

    if (
      atual.rows[0].perfil === "CEO" &&
      Number(req.usuario.id) !== id
    ) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        erro:
          "A conta CEO somente pode alterar o próprio cadastro."
      });
    }

    await client.query(
      `
        UPDATE usuarios
        SET
          nome = $1,
          cpf = $2,
          email = $3,
          telefone = $4,
          atualizado_em = NOW()
        WHERE id = $5
      `,
      [
        nome,
        cpf,
        email,
        telefone || null,
        id
      ]
    );

    const empresa = await client.query(
      `
        SELECT e.id
        FROM empresas e
        INNER JOIN clientes c
          ON c.id = e.cliente_id
        WHERE c.usuario_id = $1
        ORDER BY e.id
        LIMIT 1
      `,
      [id]
    );

    if (empresa.rowCount) {
      if (
        cnpj &&
        !validarCNPJ(cnpj)
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          erro: "CNPJ inválido."
        });
      }

      await client.query(
        `
          UPDATE empresas
          SET
            razao_social = $1,
            nome_fantasia = $2,
            cnpj = $3,
            inscricao_municipal = $4,
            inscricao_estadual = $5,
            atualizado_em = NOW()
          WHERE id = $6
        `,
        [
          razaoSocial || null,
          nomeFantasia || null,
          cnpj || null,
          inscricaoMunicipal || null,
          inscricaoEstadual || null,
          empresa.rows[0].id
        ]
      );
    }

    await client.query("COMMIT");

    await auditar(req, {
      acao: "CEO_USUARIO_EDITADO",
      entidade: "usuarios",
      entidadeId: id,
      dadosNovos: {
        empresa_editada:
          Boolean(empresa.rowCount)
      }
    });

    return res.json({
      sucesso: true,
      mensagem:
        "Cadastro atualizado com sucesso."
    });
  } catch (erro) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    return tratarErro(
      res,
      erro,
      "Erro ao atualizar usuário CEO:"
    );
  } finally {
    client.release();
  }
}

async function redefinirSenha(req, res) {
  const id =
    Number(req.params.id);

  const senha =
    String(req.body.senha || "");

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: "Usuário inválido."
    });
  }

  if (!senhaForte(senha)) {
    return res.status(400).json({
      erro:
        "A senha deve ter ao menos 10 caracteres, letra maiúscula, letra minúscula e número."
    });
  }

  try {
    const usuario = await pool.query(
      `
        SELECT
          id,
          perfil
        FROM usuarios
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (!usuario.rowCount) {
      return res.status(404).json({
        erro: "Usuário não encontrado."
      });
    }

    if (
      usuario.rows[0].perfil === "CEO" &&
      Number(req.usuario.id) !== id
    ) {
      return res.status(403).json({
        erro:
          "Não é permitido redefinir a senha de outro CEO."
      });
    }

    const senhaHash =
      await bcrypt.hash(senha, 12);

    await pool.query(
      `
        UPDATE usuarios
        SET
          senha_hash = $1,
          senha_alterada_em = NOW(),
          atualizado_em = NOW()
        WHERE id = $2
      `,
      [
        senhaHash,
        id
      ]
    );

    await auditar(req, {
      acao: "CEO_SENHA_REDEFINIDA",
      entidade: "usuarios",
      entidadeId: id
    });

    return res.json({
      sucesso: true,
      mensagem:
        "Senha redefinida com sucesso."
    });
  } catch (erro) {
    return tratarErro(
      res,
      erro,
      "Erro ao redefinir senha CEO:"
    );
  }
}

async function alterarStatus(req, res) {
  const id =
    Number(req.params.id);

  const status =
    String(req.body.status || "")
      .toUpperCase();

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: "Usuário inválido."
    });
  }

  if (!["ATIVO", "INATIVO"].includes(status)) {
    return res.status(400).json({
      erro: "Status inválido."
    });
  }

  if (Number(req.usuario.id) === id) {
    return res.status(403).json({
      erro:
        "A conta CEO não pode inativar o próprio acesso."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const usuario = await client.query(
      `
        SELECT
          id,
          perfil
        FROM usuarios
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (!usuario.rowCount) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        erro: "Usuário não encontrado."
      });
    }

    if (usuario.rows[0].perfil === "CEO") {
      await client.query("ROLLBACK");

      return res.status(403).json({
        erro:
          "Não é permitido inativar outra conta CEO."
      });
    }

    await client.query(
      `
        UPDATE usuarios
        SET
          status = $1,
          atualizado_em = NOW()
        WHERE id = $2
      `,
      [
        status,
        id
      ]
    );

    const statusVinculo =
      status === "ATIVO"
        ? "ATIVO"
        : "INATIVO";

    const statusEmpresa =
      status === "ATIVO"
        ? "ATIVA"
        : "INATIVA";

    await client.query(
      `
        UPDATE empresa_usuarios
        SET
          status = $1,
          atualizado_em = NOW()
        WHERE usuario_id = $2
      `,
      [
        statusVinculo,
        id
      ]
    );

    await client.query(
      `
        UPDATE empresas e
        SET
          status = $1,
          atualizado_em = NOW()
        FROM clientes c
        WHERE
          e.cliente_id = c.id
          AND c.usuario_id = $2
      `,
      [
        statusEmpresa,
        id
      ]
    );

    await client.query("COMMIT");

    await auditar(req, {
      acao:
        status === "ATIVO"
          ? "CEO_USUARIO_ATIVADO"
          : "CEO_USUARIO_INATIVADO",
      entidade: "usuarios",
      entidadeId: id,
      dadosNovos: {
        status
      }
    });

    return res.json({
      sucesso: true,
      status,
      mensagem:
        status === "ATIVO"
          ? "Usuário ativado com sucesso."
          : "Usuário inativado com sucesso."
    });
  } catch (erro) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    return tratarErro(
      res,
      erro,
      "Erro ao alterar status CEO:"
    );
  } finally {
    client.release();
  }
}

module.exports = {
  resumo,
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  redefinirSenha,
  alterarStatus
};
