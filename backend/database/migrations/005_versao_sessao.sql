-- ============================================================
-- SDC SALA 02
-- CONTROLE DE VERSAO DE SESSAO
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS sessao_versao INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_usuarios_sessao_versao_positiva'
  ) THEN

    ALTER TABLE usuarios
      ADD CONSTRAINT ck_usuarios_sessao_versao_positiva
      CHECK (sessao_versao >= 1);

  END IF;
END
$$;