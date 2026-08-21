-- ============================================================
-- SDC SALA 02
-- DOCUMENTOS PRIVADOS PERSISTENTES NO POSTGRESQL
-- ============================================================

ALTER TABLE documentos
ADD COLUMN IF NOT EXISTS conteudo BYTEA;

DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'documentos_conteudo_5mb_chk'
  ) THEN

    ALTER TABLE documentos
    ADD CONSTRAINT documentos_conteudo_5mb_chk
    CHECK (
      conteudo IS NULL
      OR (
        octet_length(conteudo) >= 1
        AND octet_length(conteudo) <= 5242880
      )
    );

  END IF;

END
$$;

CREATE INDEX IF NOT EXISTS
  idx_documentos_hash_sha256
ON documentos(hash_sha256);

COMMENT ON COLUMN documentos.conteudo IS
  'Conteudo binario privado armazenado no PostgreSQL. Nao expor como arquivo estatico.';