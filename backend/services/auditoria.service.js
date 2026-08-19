const pool = require("../config/database");

async function registrarAuditoria({
  usuarioId = null,
  acao,
  entidade = null,
  entidadeId = null,
  ip = null,
  userAgent = null,
  dadosAnteriores = null,
  dadosNovos = null,
  executor = pool,
  propagarErro = false
}) {
  try {
    await executor.query(
      `
        INSERT INTO logs_auditoria (
          usuario_id,
          acao,
          entidade,
          entidade_id,
          ip,
          user_agent,
          dados_anteriores,
          dados_novos
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::JSONB,
          $8::JSONB
        )
      `,
      [
        usuarioId,
        acao,
        entidade,
        entidadeId,
        ip,
        userAgent,
        dadosAnteriores
          ? JSON.stringify(dadosAnteriores)
          : null,
        dadosNovos
          ? JSON.stringify(dadosNovos)
          : null
      ]
    );

    return true;

  } catch (erro) {
    console.error(
      "Erro ao registrar auditoria:",
      erro.message
    );

    if (propagarErro) {
      throw erro;
    }

    return false;
  }
}

module.exports = {
  registrarAuditoria
};
