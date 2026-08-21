const crypto = require("crypto");
const path = require("path");
const multer = require("multer");

const pool =
  require("../config/database");

const {
  registrarAuditoria
} = require(
  "../services/auditoria.service"
);

const LIMITE_ARQUIVO =
  5 * 1024 * 1024;

const upload = multer({
  storage:
    multer.memoryStorage(),

  limits: {
    fileSize:
      LIMITE_ARQUIVO,

    files: 1,
    fields: 2,
    parts: 3,

    fieldNameSize: 100,
    fieldSize: 1024
  }
}).single("documento");


function receberDocumento(
  req,
  res,
  next
) {

  upload(
    req,
    res,
    (erro) => {

      if (!erro) {
        return next();
      }

      if (
        erro instanceof
        multer.MulterError
      ) {

        if (
          erro.code ===
          "LIMIT_FILE_SIZE"
        ) {
          return res
            .status(413)
            .json({
              erro:
                "O arquivo excede o limite de 5 MB."
            });
        }

        return res
          .status(400)
          .json({
            erro:
              "Upload invalido."
          });
      }

      console.error(
        "Erro ao receber documento:",
        erro.message
      );

      return res
        .status(400)
        .json({
          erro:
            "Nao foi possivel receber o arquivo."
        });
    }
  );
}


function idPositivo(valor) {

  const id =
    Number(valor);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return id;
}


function detectarTipoArquivo(buffer) {

  if (
    !Buffer.isBuffer(buffer) ||
    !buffer.length
  ) {
    return null;
  }


  const assinaturaPdf =
    Buffer.from(
      "%PDF-",
      "ascii"
    );

  if (
    buffer.length >=
      assinaturaPdf.length &&
    buffer
      .subarray(
        0,
        assinaturaPdf.length
      )
      .equals(
        assinaturaPdf
      )
  ) {
    return {
      mime:
        "application/pdf",
      extensao:
        ".pdf"
    };
  }


  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return {
      mime:
        "image/jpeg",
      extensao:
        ".jpg"
    };
  }


  const assinaturaPng =
    Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a
    ]);

  if (
    buffer.length >=
      assinaturaPng.length &&
    buffer
      .subarray(
        0,
        assinaturaPng.length
      )
      .equals(
        assinaturaPng
      )
  ) {
    return {
      mime:
        "image/png",
      extensao:
        ".png"
    };
  }


  return null;
}


function nomeOriginalSeguro(valor) {

  const entrada =
    String(
      valor ||
      "documento"
    )
      .replace(
        /\\/g,
        "/"
      );

  let nome =
    path.posix.basename(
      entrada
    );

  nome =
    nome
      .replace(
        /[\u0000-\u001f\u007f]/g,
        ""
      )
      .replace(
        /[\\/:*?"<>|]/g,
        "_"
      )
      .trim();

  if (!nome) {
    nome =
      "documento";
  }

  return nome
    .slice(
      0,
      220
    );
}


function nomeAsciiSeguro(valor) {

  let nome =
    nomeOriginalSeguro(
      valor
    );

  nome =
    nome
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^\x20-\x7e]/g,
        "_"
      )
      .replace(
        /["\\]/g,
        "_"
      )
      .trim();

  return (
    nome ||
    "documento"
  );
}


function codificarNomeUtf8(valor) {

  return encodeURIComponent(
    nomeOriginalSeguro(
      valor
    )
  ).replace(
    /['()*]/g,
    (caractere) =>
      "%" +
      caractere
        .charCodeAt(0)
        .toString(16)
        .toUpperCase()
  );
}


function hashArquivo(buffer) {

  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}


function hashesIguais(
  recebido,
  esperado
) {

  const a =
    String(
      recebido ||
      ""
    )
      .trim()
      .toLowerCase();

  const b =
    String(
      esperado ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    !/^[a-f0-9]{64}$/.test(a) ||
    !/^[a-f0-9]{64}$/.test(b)
  ) {
    return false;
  }

  const bufferA =
    Buffer.from(
      a,
      "hex"
    );

  const bufferB =
    Buffer.from(
      b,
      "hex"
    );

  return (
    bufferA.length ===
      bufferB.length &&
    crypto.timingSafeEqual(
      bufferA,
      bufferB
    )
  );
}


async function buscarProcessoAcessivel(
  executor,
  usuarioId,
  processoId
) {

  const resultado =
    await executor.query(
      `
        SELECT
          p.id,
          p.cliente_id,
          p.codigo_sdc,
          p.titulo

        FROM processos p

        INNER JOIN clientes c
          ON c.id = p.cliente_id

        WHERE p.id = $2
          AND p.visivel_cliente = TRUE

          AND (
            c.usuario_id = $1

            OR EXISTS (
              SELECT 1

              FROM empresa_usuarios eu

              WHERE
                eu.empresa_id =
                  p.empresa_id

                AND eu.usuario_id =
                  $1

                AND eu.status =
                  'ATIVO'
            )
          )

        LIMIT 1
      `,
      [
        usuarioId,
        processoId
      ]
    );

  return (
    resultado.rows[0] ||
    null
  );
}


async function enviarDocumento(
  req,
  res
) {

  if (
    !req.file ||
    !Buffer.isBuffer(
      req.file.buffer
    )
  ) {
    return res
      .status(400)
      .json({
        erro:
          "Selecione um arquivo."
      });
  }


  if (
    req.file.buffer.length < 1 ||
    req.file.buffer.length >
      LIMITE_ARQUIVO
  ) {
    return res
      .status(413)
      .json({
        erro:
          "O arquivo deve possuir no maximo 5 MB."
      });
  }


  const processoId =
    idPositivo(
      req.body.processo_id
    );

  if (!processoId) {
    return res
      .status(400)
      .json({
        erro:
          "Informe um processo valido."
      });
  }


  const categoria =
    String(
      req.body.categoria ||
      ""
    ).trim();

  if (
    categoria.length >
    100
  ) {
    return res
      .status(400)
      .json({
        erro:
          "A categoria pode ter no maximo 100 caracteres."
      });
  }


  const tipoArquivo =
    detectarTipoArquivo(
      req.file.buffer
    );

  if (!tipoArquivo) {
    return res
      .status(415)
      .json({
        erro:
          "Formato nao permitido. Envie somente PDF, JPG ou PNG."
      });
  }


  const nomeOriginal =
    nomeOriginalSeguro(
      req.file.originalname
    );

  const nomeInterno =
    crypto.randomUUID() +
    tipoArquivo.extensao;

  const caminhoInterno =
    "postgresql://documentos/" +
    nomeInterno;

  const hash =
    hashArquivo(
      req.file.buffer
    );


  const client =
    await pool.connect();

  try {

    await client.query(
      "BEGIN"
    );


    const processo =
      await buscarProcessoAcessivel(
        client,
        req.usuario.id,
        processoId
      );


    if (!processo) {

      await client.query(
        "ROLLBACK"
      );

      return res
        .status(404)
        .json({
          erro:
            "Processo nao encontrado."
        });
    }


    const resultado =
      await client.query(
        `
          INSERT INTO documentos (
            cliente_id,
            processo_id,
            nome_original,
            nome_arquivo,
            caminho_arquivo,
            tipo_mime,
            tamanho_bytes,
            status,
            categoria,
            enviado_por_usuario_id,
            visivel_cliente,
            hash_sha256,
            conteudo
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'ATIVO',
            $8,
            $9,
            TRUE,
            $10,
            $11
          )
          RETURNING
            id,
            processo_id,
            nome_original,
            tipo_mime,
            tamanho_bytes,
            status,
            categoria,
            hash_sha256,
            criado_em
        `,
        [
          processo.cliente_id,
          processo.id,
          nomeOriginal,
          nomeInterno,
          caminhoInterno,
          tipoArquivo.mime,
          req.file.buffer.length,
          categoria || null,
          req.usuario.id,
          hash,
          req.file.buffer
        ]
      );


    const documento =
      resultado.rows[0];


    await registrarAuditoria({
      usuarioId:
        req.usuario.id,

      acao:
        "DOCUMENTO_ENVIADO_CLIENTE",

      entidade:
        "documentos",

      entidadeId:
        documento.id,

      ip:
        req.ip,

      userAgent:
        req.headers[
          "user-agent"
        ],

      dadosNovos: {
        processo_id:
          processo.id,

        tipo_mime:
          tipoArquivo.mime,

        tamanho_bytes:
          req.file.buffer.length,

        hash_sha256:
          hash
      },

      executor:
        client,

      propagarErro:
        true
    });


    await client.query(
      "COMMIT"
    );


    res.set(
      "Cache-Control",
      "no-store"
    );


    return res
      .status(201)
      .json({
        sucesso: true,

        mensagem:
          "Documento enviado com sucesso.",

        documento
      });


  } catch (erro) {

    await client
      .query(
        "ROLLBACK"
      )
      .catch(
        () => {}
      );


    console.error(
      "Erro no upload privado:",
      erro
    );


    return res
      .status(500)
      .json({
        erro:
          "Nao foi possivel salvar o documento."
      });


  } finally {

    client.release();

  }
}


async function baixarDocumento(
  req,
  res
) {

  const documentoId =
    idPositivo(
      req.params.id
    );


  if (!documentoId) {
    return res
      .status(400)
      .json({
        erro:
          "Documento invalido."
      });
  }


  try {

    const resultado =
      await pool.query(
        `
          SELECT
            d.id,
            d.processo_id,
            d.nome_original,
            d.tipo_mime,
            d.tamanho_bytes,
            d.hash_sha256,
            d.conteudo

          FROM documentos d

          INNER JOIN clientes c
            ON c.id = d.cliente_id

          LEFT JOIN processos p
            ON p.id =
              d.processo_id

          WHERE d.id = $2

            AND d.visivel_cliente =
              TRUE

            AND d.status <>
              'EXCLUIDO'

            AND (
              c.usuario_id = $1

              OR (
                p.id IS NOT NULL

                AND
                p.visivel_cliente =
                  TRUE

                AND EXISTS (
                  SELECT 1

                  FROM empresa_usuarios eu

                  WHERE
                    eu.empresa_id =
                      p.empresa_id

                    AND
                    eu.usuario_id =
                      $1

                    AND
                    eu.status =
                      'ATIVO'
                )
              )
            )

          LIMIT 1
        `,
        [
          req.usuario.id,
          documentoId
        ]
      );


    const documento =
      resultado.rows[0];


    if (
      !documento ||
      !Buffer.isBuffer(
        documento.conteudo
      ) ||
      !documento.conteudo.length
    ) {
      return res
        .status(404)
        .json({
          erro:
            "Documento nao encontrado."
        });
    }


    const tipoReal =
      detectarTipoArquivo(
        documento.conteudo
      );


    if (!tipoReal) {
      return res
        .status(422)
        .json({
          erro:
            "O documento armazenado possui formato invalido."
        });
    }


    const hashAtual =
      hashArquivo(
        documento.conteudo
      );


    if (
      documento.hash_sha256 &&
      !hashesIguais(
        hashAtual,
        documento.hash_sha256
      )
    ) {

      console.error(
        "Falha de integridade no documento:",
        documento.id
      );

      return res
        .status(409)
        .json({
          erro:
            "A verificacao de integridade do documento falhou."
        });
    }


    await registrarAuditoria({
      usuarioId:
        req.usuario.id,

      acao:
        "DOCUMENTO_BAIXADO_CLIENTE",

      entidade:
        "documentos",

      entidadeId:
        documento.id,

      ip:
        req.ip,

      userAgent:
        req.headers[
          "user-agent"
        ],

      dadosNovos: {
        processo_id:
          documento.processo_id,

        tamanho_bytes:
          documento.conteudo.length
      }
    });


    const nomeOriginal =
      nomeOriginalSeguro(
        documento.nome_original
      );

    const nomeAscii =
      nomeAsciiSeguro(
        nomeOriginal
      );

    const nomeUtf8 =
      codificarNomeUtf8(
        nomeOriginal
      );


    res.set({
      "Content-Type":
        tipoReal.mime,

      "Content-Length":
        String(
          documento.conteudo.length
        ),

      "Content-Disposition":
        `attachment; filename="${nomeAscii}"; filename*=UTF-8''${nomeUtf8}`,

      "Cache-Control":
        "private, no-store, max-age=0",

      "Pragma":
        "no-cache",

      "X-Content-Type-Options":
        "nosniff"
    });


    return res.send(
      documento.conteudo
    );


  } catch (erro) {

    console.error(
      "Erro no download privado:",
      erro
    );

    return res
      .status(500)
      .json({
        erro:
          "Nao foi possivel baixar o documento."
      });
  }
}


module.exports = {
  receberDocumento,
  enviarDocumento,
  baixarDocumento
};