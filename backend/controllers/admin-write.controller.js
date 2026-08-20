const pool =
  require("../config/database");

const {
  registrarAuditoria
} = require(
  "../services/auditoria.service"
);

const STATUS_PERMITIDOS =
  new Set([
    "NOVO",
    "DOCUMENTACAO_PENDENTE",
    "DOCUMENTACAO_EM_ANALISE",
    "EM_PREPARACAO",
    "PROTOCOLADO",
    "EM_ANALISE_ORGAO",
    "EXIGENCIA",
    "AGUARDANDO_CLIENTE",
    "EXIGENCIA_CUMPRIDA",
    "DEFERIDO",
    "CONCLUIDO",
    "INDEFERIDO",
    "CANCELADO",
    "SUSPENSO",
    "ARQUIVADO"
  ]);

const ALIASES_STATUS = {
  RECEBIDO:
    "NOVO",

  EM_ANALISE_DOCUMENTAL:
    "DOCUMENTACAO_EM_ANALISE",

  AGUARDANDO_DOCUMENTO:
    "DOCUMENTACAO_PENDENTE",

  EM_ANDAMENTO:
    "EM_PREPARACAO",

  EM_EXIGENCIA:
    "EXIGENCIA"
};

function idValido(valor) {
  return /^\d+$/.test(
    String(valor || "")
  );
}

function texto(valor) {
  return String(
    valor || ""
  ).trim();
}

function normalizarStatus(valor) {
  let status =
    texto(valor)
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .toUpperCase()
      .replace(
        /[^A-Z0-9]+/g,
        "_"
      )
      .replace(
        /^_+|_+$/g,
        ""
      );

  if (ALIASES_STATUS[status]) {
    status =
      ALIASES_STATUS[status];
  }

  return status;
}

async function criarProcesso(
  req,
  res
) {
  const clienteId =
    req.body.cliente_id;

  const tipoServico =
    texto(
      req.body.tipo_servico ||
      req.body.tipo
    );

  const descricao =
    texto(
      req.body.descricao
    );

  const status =
    normalizarStatus(
      req.body.status || "NOVO"
    );

  if (!idValido(clienteId)) {
    return res.status(400).json({
      erro:
        "Cliente invalido."
    });
  }

  if (
    !tipoServico ||
    !descricao
  ) {
    return res.status(400).json({
      erro:
        "Informe o tipo de servico e a descricao."
    });
  }

  if (
    tipoServico.length > 150
  ) {
    return res.status(400).json({
      erro:
        "Tipo de servico muito extenso."
    });
  }

  if (
    !STATUS_PERMITIDOS.has(
      status
    )
  ) {
    return res.status(400).json({
      erro:
        "Status de processo invalido."
    });
  }

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const cliente =
      await client.query(
        `
          SELECT id
          FROM clientes
          WHERE id = $1
          LIMIT 1
        `,
        [clienteId]
      );

    if (!cliente.rowCount) {
      await client.query(
        "ROLLBACK"
      );

      return res.status(404).json({
        erro:
          "Cliente nao encontrado."
      });
    }

    const resultado =
      await client.query(
        `
          INSERT INTO processos (
            cliente_id,
            titulo,
            tipo_servico,
            descricao,
            status,
            prioridade,
            responsavel_usuario_id,
            visivel_cliente
          )
          VALUES (
            $1,
            $2,
            $2,
            $3,
            $4,
            'NORMAL',
            $5,
            TRUE
          )
          RETURNING
            id,
            codigo_sdc,
            cliente_id,
            titulo,
            tipo_servico,
            descricao,
            status,
            prioridade,
            responsavel_usuario_id,
            criado_em,
            atualizado_em
        `,
        [
          clienteId,
          tipoServico,
          descricao,
          status,
          req.usuario.id
        ]
      );

    const processo =
      resultado.rows[0];

    await client.query(
      `
        INSERT INTO historico_processos (
          processo_id,
          usuario_id,
          status_anterior,
          status_novo,
          descricao,
          tipo_evento,
          visivel_cliente,
          dados
        )
        VALUES (
          $1,
          $2,
          NULL,
          $3,
          $4,
          'CRIACAO',
          TRUE,
          $5::JSONB
        )
      `,
      [
        processo.id,
        req.usuario.id,
        status,
        "Processo criado pela Sala 02.",
        JSON.stringify({
          codigo_sdc:
            processo.codigo_sdc,
          tipo_servico:
            tipoServico
        })
      ]
    );

    await registrarAuditoria({
      usuarioId:
        req.usuario.id,

      acao:
        "PROCESSO_CRIADO",

      entidade:
        "processos",

      entidadeId:
        processo.id,

      ip:
        req.ip,

      userAgent:
        req.headers[
          "user-agent"
        ],

      dadosNovos: {
        codigo_sdc:
          processo.codigo_sdc,
        cliente_id:
          Number(clienteId),
        tipo_servico:
          tipoServico,
        status
      },

      executor:
        client,

      propagarErro:
        true
    });

    await client.query(
      "COMMIT"
    );

    return res
      .status(201)
      .json({
        sucesso: true,
        processo
      });

  } catch (erro) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // rollback ja executado
    }

    console.error(
      "Erro ao criar processo:",
      erro.message
    );

    return res.status(500).json({
      erro:
        "Erro ao criar processo."
    });

  } finally {
    client.release();
  }
}

async function atualizarStatusProcesso(
  req,
  res
) {
  const processoId =
    req.params.id;

  const statusNovo =
    normalizarStatus(
      req.body.status
    );

  if (!idValido(processoId)) {
    return res.status(400).json({
      erro:
        "Processo invalido."
    });
  }

  if (
    !STATUS_PERMITIDOS.has(
      statusNovo
    )
  ) {
    return res.status(400).json({
      erro:
        "Status de processo invalido."
    });
  }

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const atual =
      await client.query(
        `
          SELECT
            id,
            codigo_sdc,
            status
          FROM processos
          WHERE id = $1
          FOR UPDATE
        `,
        [processoId]
      );

    if (!atual.rowCount) {
      await client.query(
        "ROLLBACK"
      );

      return res.status(404).json({
        erro:
          "Processo nao encontrado."
      });
    }

    const processoAtual =
      atual.rows[0];

    if (
      processoAtual.status ===
      statusNovo
    ) {
      await client.query(
        "COMMIT"
      );

      return res.json({
        sucesso: true,
        alterado: false,
        processo:
          processoAtual
      });
    }

    const finalizadores =
      [
        "CONCLUIDO",
        "DEFERIDO",
        "INDEFERIDO",
        "CANCELADO",
        "ARQUIVADO"
      ];

    const finalizar =
      finalizadores.includes(
        statusNovo
      );

    const atualizado =
      await client.query(
        `
          UPDATE processos
          SET
            status = $2,
            atualizado_em = NOW(),
            data_conclusao =
              CASE
                WHEN $3::BOOLEAN
                  THEN COALESCE(
                    data_conclusao,
                    NOW()
                  )
                ELSE NULL
              END
          WHERE id = $1
          RETURNING
            id,
            codigo_sdc,
            status,
            atualizado_em,
            data_conclusao
        `,
        [
          processoId,
          statusNovo,
          finalizar
        ]
      );

    const processo =
      atualizado.rows[0];

    await client.query(
      `
        INSERT INTO historico_processos (
          processo_id,
          usuario_id,
          status_anterior,
          status_novo,
          descricao,
          tipo_evento,
          visivel_cliente,
          dados
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'STATUS',
          TRUE,
          $6::JSONB
        )
      `,
      [
        processoId,
        req.usuario.id,
        processoAtual.status,
        statusNovo,
        `Status alterado de ${processoAtual.status} para ${statusNovo}.`,
        JSON.stringify({
          status_anterior:
            processoAtual.status,
          status_novo:
            statusNovo
        })
      ]
    );

    await registrarAuditoria({
      usuarioId:
        req.usuario.id,

      acao:
        "PROCESSO_STATUS_ALTERADO",

      entidade:
        "processos",

      entidadeId:
        processo.id,

      ip:
        req.ip,

      userAgent:
        req.headers[
          "user-agent"
        ],

      dadosAnteriores: {
        status:
          processoAtual.status
      },

      dadosNovos: {
        status:
          statusNovo
      },

      executor:
        client,

      propagarErro:
        true
    });

    await client.query(
      "COMMIT"
    );

    return res.json({
      sucesso: true,
      alterado: true,
      processo
    });

  } catch (erro) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // rollback ja executado
    }

    console.error(
      "Erro ao alterar status:",
      erro.message
    );

    return res.status(500).json({
      erro:
        "Erro ao atualizar status do processo."
    });

  } finally {
    client.release();
  }
}


async function ativarCliente(
  req,
  res
) {
  const clienteId =
    req.params.id;

  if (
    !/^\d+$/.test(
      String(
        clienteId || ""
      )
    )
  ) {
    return res.status(400).json({
      erro:
        "Cliente invalido."
    });
  }

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const resultado =
      await client.query(
        `
          SELECT
            c.id AS cliente_id,
            c.usuario_id,
            u.perfil,
            u.status,
            u.email_verificado

          FROM clientes c

          INNER JOIN usuarios u
            ON u.id =
               c.usuario_id

          WHERE c.id = $1

          LIMIT 1

          FOR UPDATE
        `,
        [
          clienteId
        ]
      );

    if (
      !resultado.rowCount
    ) {
      await client.query(
        "ROLLBACK"
      );

      return res.status(404).json({
        erro:
          "Cliente nao encontrado."
      });
    }

    const conta =
      resultado.rows[0];

    if (
      conta.perfil !==
      "CLIENTE"
    ) {
      await client.query(
        "ROLLBACK"
      );

      return res.status(400).json({
        erro:
          "A conta vinculada nao possui perfil de cliente."
      });
    }

    if (
      conta.status ===
      "ATIVO"
    ) {
      await client.query(
        "COMMIT"
      );

      return res.json({
        sucesso: true,
        alterado: false,
        status: "ATIVO",
        mensagem:
          "A conta ja esta ativa."
      });
    }

    await client.query(
      `
        UPDATE usuarios

        SET
          status = 'ATIVO',
          atualizado_em = NOW()

        WHERE id = $1
      `,
      [
        conta.usuario_id
      ]
    );

    await registrarAuditoria({
      usuarioId:
        req.usuario.id,

      acao:
        "CLIENTE_ATIVADO",

      entidade:
        "usuarios",

      entidadeId:
        conta.usuario_id,

      ip:
        req.ip,

      userAgent:
        req.headers[
          "user-agent"
        ],

      dadosAnteriores: {
        status:
          conta.status,

        cliente_id:
          Number(
            conta.cliente_id
          )
      },

      dadosNovos: {
        status:
          "ATIVO",

        cliente_id:
          Number(
            conta.cliente_id
          )
      },

      executor:
        client,

      propagarErro:
        true
    });

    await client.query(
      "COMMIT"
    );

    return res.json({
      sucesso: true,
      alterado: true,
      status: "ATIVO",
      mensagem:
        "Conta do cliente ativada com sucesso."
    });

  } catch (erro) {

    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // rollback ja executado
    }

    console.error(
      "Erro ao ativar cliente:",
      erro
    );

    return res.status(500).json({
      erro:
        "Erro ao ativar a conta do cliente."
    });

  } finally {
    client.release();
  }
}
module.exports = {
  criarProcesso,
  atualizarStatusProcesso,
  ativarCliente
};