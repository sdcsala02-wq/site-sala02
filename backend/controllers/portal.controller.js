const pool = require("../config/database");

const {
  registrarAuditoria
} = require("../services/auditoria.service");

const FILTRO_ACESSO_PROCESSO = `
  p.visivel_cliente = TRUE
  AND (
    c.usuario_id = $1

    OR EXISTS (
      SELECT 1
      FROM empresa_usuarios eu
      WHERE eu.empresa_id = p.empresa_id
        AND eu.usuario_id = $1
        AND eu.status = 'ATIVO'
    )
  )
`;

function idPositivo(valor) {
  const id = Number(valor);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return id;
}

function impedirCache(res) {
  res.set(
    "Cache-Control",
    "no-store"
  );
}

async function auditarConsulta(
  req,
  acao,
  entidade,
  entidadeId = null
) {
  await registrarAuditoria({
    usuarioId: req.usuario.id,
    acao,
    entidade,
    entidadeId,
    ip: req.ip,
    userAgent: req.headers["user-agent"]
  });
}

async function listarProcessos(
  req,
  res
) {
  try {
    const resultado = await pool.query(
      `
        SELECT
          p.id,
          p.codigo_sdc,
          p.protocolo,
          p.titulo,
          p.descricao,
          p.status,
          p.prioridade,
          p.tipo_servico,
          p.orgao_responsavel,
          p.prazo,
          p.data_conclusao,
          p.criado_em,
          p.atualizado_em,

          e.id AS empresa_id,
          e.cnpj AS empresa_cnpj,
          e.razao_social,
          e.nome_fantasia,

          (
            SELECT COUNT(*)::INTEGER
            FROM pendencias pe
            WHERE pe.processo_id = p.id
              AND pe.responsavel_tipo = 'CLIENTE'
              AND pe.status IN (
                'PENDENTE',
                'ENVIADA',
                'EM_ANALISE'
              )
          ) AS pendencias_cliente,

          (
            SELECT COUNT(*)::INTEGER
            FROM documentos d
            WHERE d.processo_id = p.id
              AND d.visivel_cliente = TRUE
              AND d.status <> 'EXCLUIDO'
          ) AS documentos_visiveis

        FROM processos p

        INNER JOIN clientes c
          ON c.id = p.cliente_id

        LEFT JOIN empresas e
          ON e.id = p.empresa_id

        WHERE ${FILTRO_ACESSO_PROCESSO}

        ORDER BY
          p.atualizado_em DESC,
          p.id DESC

        LIMIT 100
      `,
      [req.usuario.id]
    );

    impedirCache(res);

    await auditarConsulta(
      req,
      "CONSULTA_PORTAL_PROCESSOS",
      "processos"
    );

    return res.json({
      total: resultado.rowCount,
      processos: resultado.rows
    });

  } catch (erro) {
    console.error(
      "Erro ao listar processos do portal:",
      erro
    );

    return res.status(500).json({
      erro:
        "Erro ao consultar os processos."
    });
  }
}

async function detalharProcesso(
  req,
  res
) {
  const processoId =
    idPositivo(req.params.id);

  if (!processoId) {
    return res.status(400).json({
      erro:
        "Identificador de processo invalido."
    });
  }

  try {
    const resultadoProcesso =
      await pool.query(
        `
          SELECT
            p.id,
            p.codigo_sdc,
            p.protocolo,
            p.titulo,
            p.descricao,
            p.status,
            p.prioridade,
            p.tipo_servico,
            p.orgao_responsavel,
            p.prazo,
            p.data_conclusao,
            p.criado_em,
            p.atualizado_em,

            e.id AS empresa_id,
            e.cnpj AS empresa_cnpj,
            e.razao_social,
            e.nome_fantasia

          FROM processos p

          INNER JOIN clientes c
            ON c.id = p.cliente_id

          LEFT JOIN empresas e
            ON e.id = p.empresa_id

          WHERE p.id = $2
            AND ${FILTRO_ACESSO_PROCESSO}

          LIMIT 1
        `,
        [
          req.usuario.id,
          processoId
        ]
      );

    if (!resultadoProcesso.rowCount) {
      return res.status(404).json({
        erro:
          "Processo nao encontrado."
      });
    }

    const [
      protocolos,
      pendencias,
      historico,
      documentos,
      mensagens
    ] = await Promise.all([
      pool.query(
        `
          SELECT
            id,
            numero,
            orgao,
            tipo,
            url_consulta,
            principal,
            criado_em
          FROM protocolos_processos
          WHERE processo_id = $1
          ORDER BY
            principal DESC,
            criado_em DESC
        `,
        [processoId]
      ),

      pool.query(
        `
          SELECT
            id,
            titulo,
            descricao,
            responsavel_tipo,
            status,
            prazo,
            concluida_em,
            criado_em,
            atualizado_em
          FROM pendencias
          WHERE processo_id = $1
            AND responsavel_tipo = 'CLIENTE'
            AND status <> 'CANCELADA'
          ORDER BY
            criado_em DESC
        `,
        [processoId]
      ),

      pool.query(
        `
          SELECT
            id,
            status_anterior,
            status_novo,
            descricao,
            tipo_evento,
            dados,
            criado_em
          FROM historico_processos
          WHERE processo_id = $1
            AND visivel_cliente = TRUE
          ORDER BY
            criado_em DESC,
            id DESC
        `,
        [processoId]
      ),

      pool.query(
        `
          SELECT
            id,
            nome_original,
            categoria,
            tipo_mime,
            tamanho_bytes,
            status,
            validado_em,
            motivo_status,
            criado_em,
            atualizado_em
          FROM documentos
          WHERE processo_id = $1
            AND visivel_cliente = TRUE
            AND status <> 'EXCLUIDO'
          ORDER BY
            criado_em DESC,
            id DESC
        `,
        [processoId]
      ),

      pool.query(
        `
          SELECT
            id,
            tipo,
            mensagem,
            criado_em
          FROM mensagens_processos
          WHERE processo_id = $1
            AND visivel_cliente = TRUE
            AND tipo <> 'NOTA_INTERNA'
          ORDER BY
            criado_em ASC,
            id ASC
        `,
        [processoId]
      )
    ]);

    impedirCache(res);

    await auditarConsulta(
      req,
      "CONSULTA_PORTAL_PROCESSO",
      "processos",
      processoId
    );

    return res.json({
      processo:
        resultadoProcesso.rows[0],

      protocolos:
        protocolos.rows,

      pendencias:
        pendencias.rows,

      historico:
        historico.rows,

      documentos:
        documentos.rows,

      mensagens:
        mensagens.rows
    });

  } catch (erro) {
    console.error(
      "Erro ao detalhar processo do portal:",
      erro
    );

    return res.status(500).json({
      erro:
        "Erro ao consultar o processo."
    });
  }
}

async function listarDocumentos(
  req,
  res
) {
  try {
    const resultado = await pool.query(
      `
        SELECT
          d.id,
          d.processo_id,
          d.nome_original,
          d.categoria,
          d.tipo_mime,
          d.tamanho_bytes,
          d.status,
          d.validado_em,
          d.motivo_status,
          d.criado_em,
          d.atualizado_em,

          p.codigo_sdc,
          p.titulo AS processo_titulo

        FROM documentos d

        INNER JOIN clientes c
          ON c.id = d.cliente_id

        LEFT JOIN processos p
          ON p.id = d.processo_id

        WHERE d.visivel_cliente = TRUE
          AND d.status <> 'EXCLUIDO'
          AND (
            c.usuario_id = $1

            OR (
              p.id IS NOT NULL
              AND p.visivel_cliente = TRUE
              AND EXISTS (
                SELECT 1
                FROM empresa_usuarios eu
                WHERE eu.empresa_id = p.empresa_id
                  AND eu.usuario_id = $1
                  AND eu.status = 'ATIVO'
              )
            )
          )

        ORDER BY
          d.criado_em DESC,
          d.id DESC

        LIMIT 200
      `,
      [req.usuario.id]
    );

    impedirCache(res);

    await auditarConsulta(
      req,
      "CONSULTA_PORTAL_DOCUMENTOS",
      "documentos"
    );

    return res.json({
      total: resultado.rowCount,
      documentos: resultado.rows
    });

  } catch (erro) {
    console.error(
      "Erro ao listar documentos do portal:",
      erro
    );

    return res.status(500).json({
      erro:
        "Erro ao consultar os documentos."
    });
  }
}

module.exports = {
  listarProcessos,
  detalharProcesso,
  listarDocumentos
};