-- ============================================================
-- SDC SALA 02
-- SEGURANCA DE LOGIN POR CONTA
--
-- Preparacao estrutural para:
-- - contador de senhas incorretas;
-- - registro da ultima tentativa;
-- - bloqueio temporario da conta.
--
-- Esta migration NAO altera status do usuario
-- e NAO bloqueia nenhuma conta ao ser executada.
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS tentativas_login INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_tentativa_login TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bloqueado_ate TIMESTAMPTZ;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_usuarios_tentativas_login_nao_negativas'
  ) THEN

    ALTER TABLE usuarios
      ADD CONSTRAINT ck_usuarios_tentativas_login_nao_negativas
      CHECK (tentativas_login >= 0);

  END IF;
END
$$;