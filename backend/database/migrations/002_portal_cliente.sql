-- ============================================================
-- SDC SALA 02
-- Migration 002 - Portal do Cliente
-- ============================================================

-- ============================================================
-- 1. SEGURANCA E CICLO DA CONTA
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS email_verificacao_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verificacao_expira_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS senha_recuperacao_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS senha_recuperacao_expira_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS senha_alterada_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_usuarios_email_verificacao_token
  ON usuarios(email_verificacao_token_hash)
  WHERE email_verificacao_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_senha_recuperacao_token
  ON usuarios(senha_recuperacao_token_hash)
  WHERE senha_recuperacao_token_hash IS NOT NULL;


-- ============================================================
-- 2. ACEITES LEGAIS
-- Guarda versao, data, IP e navegador do aceite.
-- ============================================================

CREATE TABLE IF NOT EXISTS aceites_legais (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  versao VARCHAR(30) NOT NULL,
  ip VARCHAR(64),
  user_agent TEXT,
  aceito_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_aceites_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE CASCADE,

  CONSTRAINT ck_aceites_tipo
    CHECK (tipo IN ('TERMOS_USO', 'POLITICA_PRIVACIDADE'))
);

CREATE INDEX IF NOT EXISTS idx_aceites_usuario
  ON aceites_legais(usuario_id);


-- ============================================================
-- 3. USUARIOS AUTORIZADOS EM EMPRESAS
-- Uma pessoa pode acessar varias empresas.
-- Uma empresa pode ter varias pessoas autorizadas.
-- ============================================================

CREATE TABLE IF NOT EXISTS empresa_usuarios (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL,
  usuario_id BIGINT NOT NULL,
  papel VARCHAR(30) NOT NULL DEFAULT 'REPRESENTANTE',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  convidado_por_usuario_id BIGINT,
  aceito_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_empresa_usuario
    UNIQUE (empresa_id, usuario_id),

  CONSTRAINT fk_empresa_usuarios_empresa
    FOREIGN KEY (empresa_id)
    REFERENCES empresas(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_empresa_usuarios_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_empresa_usuarios_convite
    FOREIGN KEY (convidado_por_usuario_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL,

  CONSTRAINT ck_empresa_usuarios_papel
    CHECK (
      papel IN (
        'TITULAR',
        'REPRESENTANTE',
        'CONTADOR',
        'COLABORADOR'
      )
    ),

  CONSTRAINT ck_empresa_usuarios_status
    CHECK (
      status IN (
        'PENDENTE',
        'ATIVO',
        'REVOGADO'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_empresa
  ON empresa_usuarios(empresa_id);

CREATE INDEX IF NOT EXISTS idx_empresa_usuarios_usuario
  ON empresa_usuarios(usuario_id);

-- Preserva automaticamente o titular das empresas que ja existirem.
INSERT INTO empresa_usuarios (
  empresa_id,
  usuario_id,
  papel,
  status,
  aceito_em
)
SELECT
  e.id,
  c.usuario_id,
  'TITULAR',
  'ATIVO',
  NOW()
FROM empresas e
JOIN clientes c
  ON c.id = e.cliente_id
ON CONFLICT (empresa_id, usuario_id) DO NOTHING;


-- ============================================================
-- 4. EVOLUCAO DOS PROCESSOS
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS processos_codigo_sdc_seq
  START WITH 1
  INCREMENT BY 1
  CACHE 1;

CREATE OR REPLACE FUNCTION gerar_codigo_sdc()
RETURNS TEXT AS $$
BEGIN
  RETURN
    'SDC-' ||
    TO_CHAR(CURRENT_DATE, 'YYYY') ||
    '-' ||
    LPAD(
      NEXTVAL('processos_codigo_sdc_seq')::TEXT,
      6,
      '0'
    );
END;
$$ LANGUAGE plpgsql;

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS codigo_sdc VARCHAR(24),
  ADD COLUMN IF NOT EXISTS tipo_servico VARCHAR(150),
  ADD COLUMN IF NOT EXISTS orgao_responsavel VARCHAR(180),
  ADD COLUMN IF NOT EXISTS prazo TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visivel_cliente BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE processos
  ALTER COLUMN codigo_sdc
  SET DEFAULT gerar_codigo_sdc();

UPDATE processos
SET codigo_sdc = gerar_codigo_sdc()
WHERE codigo_sdc IS NULL;

ALTER TABLE processos
  ALTER COLUMN codigo_sdc SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_processos_codigo_sdc
  ON processos(codigo_sdc);

CREATE INDEX IF NOT EXISTS idx_processos_empresa
  ON processos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_processos_responsavel
  ON processos(responsavel_usuario_id);

CREATE INDEX IF NOT EXISTS idx_processos_criado_em
  ON processos(criado_em);


-- ============================================================
-- 5. PROTOCOLOS EXTERNOS
-- Prefeitura, REDESIM, Vigilancia, Bombeiros etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS protocolos_processos (
  id BIGSERIAL PRIMARY KEY,
  processo_id BIGINT NOT NULL,
  numero VARCHAR(120) NOT NULL,
  orgao VARCHAR(180),
  tipo VARCHAR(80),
  url_consulta TEXT,
  principal BOOLEAN NOT NULL DEFAULT FALSE,
  observacoes TEXT,
  criado_por_usuario_id BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_protocolos_processo
    FOREIGN KEY (processo_id)
    REFERENCES processos(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_protocolos_usuario
    FOREIGN KEY (criado_por_usuario_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_protocolos_processo_numero_orgao
  ON protocolos_processos(
    processo_id,
    numero,
    COALESCE(orgao, '')
  );

CREATE INDEX IF NOT EXISTS idx_protocolos_processo
  ON protocolos_processos(processo_id);


-- ============================================================
-- 6. PENDENCIAS
-- ============================================================

CREATE TABLE IF NOT EXISTS pendencias (
  id BIGSERIAL PRIMARY KEY,
  processo_id BIGINT NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  descricao TEXT,
  responsavel_tipo VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
  prazo TIMESTAMPTZ,
  criada_por_usuario_id BIGINT,
  concluida_por_usuario_id BIGINT,
  concluida_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_pendencias_processo
    FOREIGN KEY (processo_id)
    REFERENCES processos(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_pendencias_criada_por
    FOREIGN KEY (criada_por_usuario_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_pendencias_concluida_por
    FOREIGN KEY (concluida_por_usuario_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL,

  CONSTRAINT ck_pendencias_responsavel
    CHECK (
      responsavel_tipo IN (
        'CLIENTE',
        'SALA02',
        'ORGAO'
      )
    ),

  CONSTRAINT ck_pendencias_status
    CHECK (
      status IN (
        'PENDENTE',
        'ENVIADA',
        'EM_ANALISE',
        'CONCLUIDA',
        'CANCELADA'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_pendencias_processo
  ON pendencias(processo_id);

CREATE INDEX IF NOT EXISTS idx_pendencias_status
  ON pendencias(status);

CREATE INDEX IF NOT EXISTS idx_pendencias_prazo
  ON pendencias(prazo);


-- ============================================================
-- 7. HISTORICO / LINHA DO TEMPO
-- ============================================================

ALTER TABLE historico_processos
  ADD COLUMN IF NOT EXISTS tipo_evento VARCHAR(50)
    NOT NULL DEFAULT 'MOVIMENTACAO',
  ADD COLUMN IF NOT EXISTS visivel_cliente BOOLEAN
    NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS dados JSONB;

CREATE INDEX IF NOT EXISTS idx_historico_processo_data
  ON historico_processos(processo_id, criado_em DESC);


-- ============================================================
-- 8. DOCUMENTOS PRIVADOS E AUDITAVEIS
-- ============================================================

ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(100),
  ADD COLUMN IF NOT EXISTS enviado_por_usuario_id BIGINT,
  ADD COLUMN IF NOT EXISTS visivel_cliente BOOLEAN
    NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hash_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS validado_por_usuario_id BIGINT,
  ADD COLUMN IF NOT EXISTS validado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_status TEXT,
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ
    NOT NULL DEFAULT NOW();

ALTER TABLE documentos
  ADD CONSTRAINT fk_documentos_enviado_por
  FOREIGN KEY (enviado_por_usuario_id)
  REFERENCES usuarios(id)
  ON DELETE SET NULL;

ALTER TABLE documentos
  ADD CONSTRAINT fk_documentos_validado_por
  FOREIGN KEY (validado_por_usuario_id)
  REFERENCES usuarios(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_processo
  ON documentos(processo_id);

CREATE INDEX IF NOT EXISTS idx_documentos_hash
  ON documentos(hash_sha256)
  WHERE hash_sha256 IS NOT NULL;


-- ============================================================
-- 9. COMUNICACAO DENTRO DO PROCESSO
-- ============================================================

CREATE TABLE IF NOT EXISTS mensagens_processos (
  id BIGSERIAL PRIMARY KEY,
  processo_id BIGINT NOT NULL,
  remetente_usuario_id BIGINT,
  tipo VARCHAR(30) NOT NULL DEFAULT 'MENSAGEM',
  mensagem TEXT NOT NULL,
  visivel_cliente BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_mensagens_processo
    FOREIGN KEY (processo_id)
    REFERENCES processos(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_mensagens_remetente
    FOREIGN KEY (remetente_usuario_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL,

  CONSTRAINT ck_mensagens_tipo
    CHECK (
      tipo IN (
        'MENSAGEM',
        'NOTA_INTERNA',
        'SISTEMA'
      )
    ),

  CONSTRAINT ck_mensagem_nota_interna
    CHECK (
      tipo <> 'NOTA_INTERNA'
      OR visivel_cliente = FALSE
    )
);

CREATE INDEX IF NOT EXISTS idx_mensagens_processo
  ON mensagens_processos(processo_id, criado_em);


-- ============================================================
-- 10. ANEXOS DAS MENSAGENS
-- ============================================================

CREATE TABLE IF NOT EXISTS mensagens_documentos (
  mensagem_id BIGINT NOT NULL,
  documento_id BIGINT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (mensagem_id, documento_id),

  CONSTRAINT fk_mensagem_documento_mensagem
    FOREIGN KEY (mensagem_id)
    REFERENCES mensagens_processos(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_mensagem_documento_documento
    FOREIGN KEY (documento_id)
    REFERENCES documentos(id)
    ON DELETE CASCADE
);


-- ============================================================
-- 11. CONTROLE DE LEITURA DAS MENSAGENS
-- Permite saber exatamente quem leu.
-- ============================================================

CREATE TABLE IF NOT EXISTS mensagens_leituras (
  mensagem_id BIGINT NOT NULL,
  usuario_id BIGINT NOT NULL,
  lida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (mensagem_id, usuario_id),

  CONSTRAINT fk_leituras_mensagem
    FOREIGN KEY (mensagem_id)
    REFERENCES mensagens_processos(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_leituras_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE CASCADE
);


-- ============================================================
-- 12. NOTIFICACOES
-- ============================================================

CREATE TABLE IF NOT EXISTS notificacoes (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL,
  processo_id BIGINT,
  tipo VARCHAR(60) NOT NULL,
  canal VARCHAR(20) NOT NULL DEFAULT 'PORTAL',
  titulo VARCHAR(180) NOT NULL,
  mensagem TEXT NOT NULL,
  url_destino TEXT,
  status_envio VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
  enviada_em TIMESTAMPTZ,
  lida_em TIMESTAMPTZ,
  erro_envio TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_notificacoes_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_notificacoes_processo
    FOREIGN KEY (processo_id)
    REFERENCES processos(id)
    ON DELETE CASCADE,

  CONSTRAINT ck_notificacoes_canal
    CHECK (
      canal IN (
        'PORTAL',
        'EMAIL',
        'WHATSAPP'
      )
    ),

  CONSTRAINT ck_notificacoes_status
    CHECK (
      status_envio IN (
        'PENDENTE',
        'ENVIADA',
        'FALHA',
        'NAO_APLICAVEL'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario
  ON notificacoes(usuario_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_notificacoes_nao_lidas
  ON notificacoes(usuario_id)
  WHERE lida_em IS NULL;


-- ============================================================
-- 13. TRIGGERS atualizado_em
-- Usa a funcao criada na Migration 001.
-- ============================================================

DROP TRIGGER IF EXISTS trg_empresa_usuarios_atualizado_em
  ON empresa_usuarios;

CREATE TRIGGER trg_empresa_usuarios_atualizado_em
BEFORE UPDATE ON empresa_usuarios
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_modificacao();


DROP TRIGGER IF EXISTS trg_protocolos_atualizado_em
  ON protocolos_processos;

CREATE TRIGGER trg_protocolos_atualizado_em
BEFORE UPDATE ON protocolos_processos
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_modificacao();


DROP TRIGGER IF EXISTS trg_pendencias_atualizado_em
  ON pendencias;

CREATE TRIGGER trg_pendencias_atualizado_em
BEFORE UPDATE ON pendencias
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_modificacao();


DROP TRIGGER IF EXISTS trg_documentos_atualizado_em
  ON documentos;

CREATE TRIGGER trg_documentos_atualizado_em
BEFORE UPDATE ON documentos
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_modificacao();


DROP TRIGGER IF EXISTS trg_notificacoes_atualizado_em
  ON notificacoes;

CREATE TRIGGER trg_notificacoes_atualizado_em
BEFORE UPDATE ON notificacoes
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_modificacao();


-- ============================================================
-- FIM DA MIGRATION 002
-- ============================================================
