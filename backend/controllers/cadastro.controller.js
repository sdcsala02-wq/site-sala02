const bcrypt = require("bcryptjs");

const pool = require("../config/database");
const {
  registrarAuditoria
} = require("../services/auditoria.service");

const VERSAO_TERMOS = "1.0";
const VERSAO_PRIVACIDADE = "1.0";

function somenteNumeros(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function valorBooleano(valor) {
  return (
    valor === true ||
    valor === 1 ||
    valor === "1" ||
    valor === "true"
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

    return resto < 2 ? 0 : 11 - resto;
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

function validarEmail(valor) {
  const email = String(valor || "")
    .trim()
    .toLowerCase();

  if (email.length < 5 || email.length > 180) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarSenha(valor) {
  const senha = String(valor || "");

  if (senha.length < 8 || senha.length > 72) {
    return false;
  }

  if (!/\p{L}/u.test(senha)) {
    return false;
  }

  if (!/\d/.test(senha)) {
    return false;
  }

  return true;
}

async function cadastro(req, res) {
  const tipoPessoa = String(
    req.body.tipo_pessoa ||
    req.body.tipoPessoa ||
    ""
  )
    .trim()
    .toUpperCase();

  const nome = String(
    req.body.nome || ""
  ).trim();

  const cpf = somenteNumeros(
    req.body.cpf ||
    req.body.cpf_responsavel ||
    req.body.cpfResponsavel ||
    ""
  );

  const cnpj = somenteNumeros(
    req.body.cnpj || ""
  );

  const razaoSocial = String(
    req.body.razao_social ||
    req.body.razaoSocial ||
    ""
  ).trim();

  const nomeFantasia = String(
    req.body.nome_fantasia ||
    req.body.nomeFantasia ||
    ""
  ).trim();

  const email = String(
    req.body.email || ""
  )
    .trim()
    .toLowerCase();

  const telefone = somenteNumeros(
    req.body.telefone || ""
  );

  const senha = String(
    req.body.senha || ""
  );

  const aceitouTermos = valorBooleano(
    req.body.aceitou_termos ??
    req.body.aceitouTermos
  );

  const aceitouPrivacidade = valorBooleano(
    req.body.aceitou_privacidade ??
    req.body.aceitouPrivacidade
  );

  if (!["PF", "PJ"].includes(tipoPessoa)) {
    return res.status(400).json({
      erro: "Informe o tipo de cadastro: PF ou PJ."
    });
  }

  if (nome.length < 3 || nome.length > 150) {
    return res.status(400).json({
      erro: "Informe o nome completo do responsavel."
    });
  }

  if (!validarCPF(cpf)) {
    return res.status(400).json({
      erro: "CPF do responsavel invalido."
    });
  }

  if (tipoPessoa === "PJ") {
    if (!validarCNPJ(cnpj)) {
      return res.status(400).json({
        erro: "CNPJ invalido."
      });
    }

    if (
      razaoSocial.length < 2 ||
      razaoSocial.length > 180
    ) {
      return res.status(400).json({
        erro: "Informe a razao social da empresa."
      });
    }
  }

  if (!validarEmail(email)) {
    return res.status(400).json({
      erro: "Informe um e-mail valido."
    });
  }

  if (
    telefone &&
    (
      telefone.length < 10 ||
      telefone.length > 15
    )
  ) {
    return res.status(400).json({
      erro: "Informe um telefone valido."
    });
  }

  if (!validarSenha(senha)) {
    return res.status(400).json({
      erro:
        "A senha deve ter entre 8 e 72 caracteres, com pelo menos uma letra e um numero."
    });
  }

  if (
    !aceitouTermos ||
    !aceitouPrivacidade
  ) {
    return res.status(400).json({
      erro:
        "E necessario aceitar os Termos de Uso e a Politica de Privacidade."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const conflitoUsuario = await client.query(
      `
        SELECT id
        FROM usuarios
        WHERE cpf = $1
           OR LOWER(email) = $2
        LIMIT 1
      `,
      [cpf, email]
    );

    if (conflitoUsuario.rowCount) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        erro:
          "Ja existe uma conta vinculada aos dados informados."
      });
    }

    if (tipoPessoa === "PJ") {
      const conflitoEmpresa = await client.query(
        `
          SELECT id
          FROM empresas
          WHERE cnpj = $1
          LIMIT 1
        `,
        [cnpj]
      );

      if (conflitoEmpresa.rowCount) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          erro:
            "Ja existe uma conta vinculada aos dados informados."
        });
      }
    }

    const senhaHash = await bcrypt.hash(
      senha,
      12
    );

    const usuarioResultado =
      await client.query(
        `
          INSERT INTO usuarios (
            nome,
            cpf,
            email,
            telefone,
            senha_hash,
            perfil,
            status,
            email_verificado
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'CLIENTE',
            'PENDENTE',
            FALSE
          )
          RETURNING
            id,
            uuid,
            nome,
            perfil,
            status,
            email_verificado
        `,
        [
          nome,
          cpf,
          email,
          telefone || null,
          senhaHash
        ]
      );

    const usuario =
      usuarioResultado.rows[0];

    const clienteResultado =
      await client.query(
        `
          INSERT INTO clientes (
            usuario_id,
            tipo_pessoa
          )
          VALUES ($1, $2)
          RETURNING
            id,
            tipo_pessoa
        `,
        [
          usuario.id,
          tipoPessoa
        ]
      );

    const cliente =
      clienteResultado.rows[0];

    let empresa = null;

    if (tipoPessoa === "PJ") {
      const empresaResultado =
        await client.query(
          `
            INSERT INTO empresas (
              cliente_id,
              razao_social,
              nome_fantasia,
              cnpj,
              status
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              'ATIVA'
            )
            RETURNING
              id,
              razao_social,
              nome_fantasia,
              cnpj,
              status
          `,
          [
            cliente.id,
            razaoSocial,
            nomeFantasia || null,
            cnpj
          ]
        );

      empresa =
        empresaResultado.rows[0];

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
          empresa.id,
          usuario.id
        ]
      );
    }

    await client.query(
      `
        INSERT INTO aceites_legais (
          usuario_id,
          tipo,
          versao,
          ip,
          user_agent
        )
        VALUES
          (
            $1,
            'TERMOS_USO',
            $2,
            $4,
            $5
          ),
          (
            $1,
            'POLITICA_PRIVACIDADE',
            $3,
            $4,
            $5
          )
      `,
      [
        usuario.id,
        VERSAO_TERMOS,
        VERSAO_PRIVACIDADE,
        req.ip || null,
        req.headers["user-agent"] || null
      ]
    );

    await registrarAuditoria({
      usuarioId: usuario.id,
      acao: "CLIENTE_CADASTRADO",
      entidade: "clientes",
      entidadeId: cliente.id,
      ip: req.ip,
      userAgent:
        req.headers["user-agent"],
      dadosNovos: {
        tipo_pessoa: tipoPessoa,
        empresa_criada: Boolean(empresa),
        login_cpf: true,
        login_cnpj: Boolean(empresa)
      },
      executor: client,
      propagarErro: true
    });

    await client.query("COMMIT");

    return res.status(201).json({
      sucesso: true,
      mensagem:
        "Cadastro recebido e aguardando validacao.",

      conta: {
        uuid: usuario.uuid,
        nome: usuario.nome,
        perfil: usuario.perfil,
        status: usuario.status,
        tipo_pessoa:
          cliente.tipo_pessoa,
        email_verificado:
          usuario.email_verificado,
        login_por_cpf: true,
        login_por_cnpj:
          Boolean(empresa)
      }
    });

  } catch (erro) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    if (erro.code === "23505") {
      return res.status(409).json({
        erro:
          "Ja existe uma conta vinculada aos dados informados."
      });
    }

    console.error(
      "Erro no cadastro publico:",
      erro
    );

    return res.status(500).json({
      erro:
        "Erro interno ao realizar o cadastro."
    });

  } finally {
    client.release();
  }
}

module.exports = {
  cadastro
};
