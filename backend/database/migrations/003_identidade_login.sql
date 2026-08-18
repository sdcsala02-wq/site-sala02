-- ============================================================
-- SDC SALA 02
-- Migration 003 - Identidade e Login CPF/CNPJ
-- ============================================================

-- CPF deve ser nulo ou possuir exatamente 11 digitos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_usuarios_cpf_formato'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT ck_usuarios_cpf_formato
      CHECK (
        cpf IS NULL
        OR cpf ~ '^[0-9]{11}$'
      );
  END IF;
END
$$;

-- CNPJ deve ser nulo ou possuir exatamente 14 digitos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_empresas_cnpj_formato'
  ) THEN
    ALTER TABLE empresas
      ADD CONSTRAINT ck_empresas_cnpj_formato
      CHECK (
        cnpj IS NULL
        OR cnpj ~ '^[0-9]{14}$'
      );
  END IF;
END
$$;

-- Uma empresa tera apenas um TITULAR ATIVO.
-- Esse titular sera a conta utilizada quando o login for feito por CNPJ.
CREATE UNIQUE INDEX IF NOT EXISTS
  uq_empresa_titular_ativo
ON empresa_usuarios (empresa_id)
WHERE papel = 'TITULAR'
  AND status = 'ATIVO';

-- Indices para resolucao rapida do login.
CREATE INDEX IF NOT EXISTS idx_usuarios_cpf_login
  ON usuarios(cpf)
  WHERE cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_empresas_cnpj_login
  ON empresas(cnpj)
  WHERE cnpj IS NOT NULL;

-- ============================================================
-- FIM DA MIGRATION 003
-- ============================================================
