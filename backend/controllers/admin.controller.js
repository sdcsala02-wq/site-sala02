const pool = require("../config/database");

function idValido(valor) {
  return /^\d+$/.test(String(valor || ""));
}

async function resumo(req, res) {
  try {
    const totais = await pool.query(`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM clientes
        ) AS clientes,

        (
          SELECT COUNT(*)::int
          FROM empresas
        ) AS empresas,

        (
          SELECT COUNT(*)::int
          FROM processos
        ) AS processos,

        (
          SELECT COUNT(*)::int
          FROM pendencias
          WHERE status NOT IN (
            'CONCLUIDA',
            'CANCELADA'
          )
        ) AS pendencias_abertas
    `);

    const statusProcessos =
      await pool.query(`
        SELECT
          status,
          COUNT(*)::int AS total
        FROM processos
        GROUP BY status
        ORDER BY status
      `);

    return res.json({
      totais: totais.rows[0],
      processos_por_status:
        statusProcessos.rows
    });

  } catch (erro) {
    console.error(
      "Erro ao gerar resumo admin:",
      erro.message
    );

    return res.status(500).json({
      erro:
        "Erro ao carregar resumo administrativo."
    });
  }
}

async function listarClientes(req, res) {
  try {
    const resultado =
      await pool.query(`
        SELECT
          c.id,
          c.tipo_pessoa,
          c.observacoes,
          c.criado_em,
          c.atualizado_em,

          u.id AS usuario_id,
          u.nome,
          u.cpf,
          u.email,
          u.telefone,
          u.status AS usuario_status,
          u.email_verificado,

          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', e.id,
                  'razao_social',
                    e.razao_social,
                  'nome_fantasia',
                    e.nome_fantasia,
                  'cnpj',
                    e.cnpj,
                  'inscricao_municipal',
                    e.inscricao_municipal,
                  'inscricao_estadual',
                    e.inscricao_estadual,
                  'status',
                    e.status
                )
                ORDER BY e.id
              )
              FROM empresas e
              WHERE e.cliente_id = c.id
            ),
            '[]'::jsonb
          ) AS empresas

        FROM clientes c

        INNER JOIN usuarios u
          ON u.id = c.usuario_id

        ORDER BY c.id DESC
      `);

    return res.json(resultado.rows);

  } catch (erro) {
    console.error(
      "Erro ao listar clientes admin:",
      erro.message
    );

    return res.status(500).json({
      erro:
        "Erro ao listar clientes."
    });
  }
}

async function listarProcessos(req, res) {
  try {
    const resultado =
      await pool.query(`
        SELECT
          p.id,
          p.codigo_sdc,
          p.cliente_id,
          p.empresa_id,
          p.protocolo,
          p.titulo,
          p.tipo_servico,
          p.descricao,
          p.status,
          p.prioridade,
          p.orgao_responsavel,
          p.prazo,
          p.data_conclusao,
          p.visivel_cliente,
          p.responsavel_usuario_id,
          p.criado_em,
          p.atualizado_em,

          uc.nome AS cliente_nome,
          uc.cpf AS cliente_cpf,

          e.razao_social,
          e.nome_fantasia,
          e.cnpj,

          ur.nome AS responsavel_nome,

          (
            SELECT COUNT(*)::int
            FROM pendencias pe
            WHERE
              pe.processo_id = p.id
              AND pe.status NOT IN (
                'CONCLUIDA',
                'CANCELADA'
              )
          ) AS pendencias_abertas

        FROM processos p

        INNER JOIN clientes c
          ON c.id = p.cliente_id

        INNER JOIN usuarios uc
          ON uc.id = c.usuario_id

        LEFT JOIN empresas e
          ON e.id = p.empresa_id

        LEFT JOIN usuarios ur
          ON ur.id =
            p.responsavel_usuario_id

        ORDER BY p.id DESC
      `);

    return res.json(resultado.rows);

  } catch (erro) {
    console.error(
      "Erro ao listar processos admin:",
      erro.message
    );

    return res.status(500).json({
      erro:
        "Erro ao listar processos."
    });
  }
}

async function listarProcessosCliente(
  req,
  res
) {
  const clienteId = req.params.id;

  if (!idValido(clienteId)) {
    return res.status(400).json({
      erro:
        "Identificador de cliente invalido."
    });
  }

  try {
    const cliente =
      await pool.query(
        `
          SELECT
            c.id,
            u.nome
          FROM clientes c
          INNER JOIN usuarios u
            ON u.id = c.usuario_id
          WHERE c.id = $1
          LIMIT 1
        `,
        [clienteId]
      );

    if (!cliente.rowCount) {
      return res.status(404).json({
        erro:
          "Cliente nao encontrado."
      });
    }

    const processos =
      await pool.query(
        `
          SELECT
            p.id,
            p.codigo_sdc,
            p.cliente_id,
            p.empresa_id,
            p.protocolo,
            p.titulo,
            p.tipo_servico,
            p.descricao,
            p.status,
            p.prioridade,
            p.orgao_responsavel,
            p.prazo,
            p.data_conclusao,
            p.visivel_cliente,
            p.responsavel_usuario_id,
            p.criado_em,
            p.atualizado_em,

            e.razao_social,
            e.nome_fantasia,
            e.cnpj,

            ur.nome AS responsavel_nome

          FROM processos p

          LEFT JOIN empresas e
            ON e.id = p.empresa_id

          LEFT JOIN usuarios ur
            ON ur.id =
              p.responsavel_usuario_id

          WHERE p.cliente_id = $1

          ORDER BY p.id DESC
        `,
        [clienteId]
      );

    return res.json({
      cliente: cliente.rows[0],
      processos: processos.rows
    });

  } catch (erro) {
    console.error(
      "Erro ao listar processos do cliente:",
      erro.message
    );

    return res.status(500).json({
      erro:
        "Erro ao listar processos do cliente."
    });
  }
}

module.exports = {
  resumo,
  listarClientes,
  listarProcessos,
  listarProcessosCliente
};