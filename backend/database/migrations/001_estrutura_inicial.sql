CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  nome VARCHAR(150) NOT NULL,
  cpf VARCHAR(11) UNIQUE,
  email VARCHAR(180) NOT NULL UNIQUE,
  telefone VARCHAR(20),
  senha_hash TEXT NOT NULL,
  perfil VARCHAR(30) NOT NULL DEFAULT 'CLIENTE',
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
  email_verificado BOOLEAN NOT NULL DEFAULT FALSE,
  ultimo_login TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL UNIQUE,
  tipo_pessoa VARCHAR(10) NOT NULL DEFAULT 'PF',
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_clientes_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS empresas (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL,
  razao_social VARCHAR(180),
  nome_fantasia VARCHAR(180),
  cnpj VARCHAR(14) UNIQUE,
  inscricao_municipal VARCHAR(50),
  inscricao_estadual VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVA',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_empresas_cliente
    FOREIGN KEY (cliente_id)
    REFERENCES clientes(id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS processos (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL,
  empresa_id BIGINT,
  protocolo VARCHAR(50) UNIQUE,
  titulo VARCHAR(180) NOT NULL,
  descricao TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'ABERTO',
  prioridade VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  responsavel_usuario_id BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_processos_cliente
    FOREIGN KEY (cliente_id)
    REFERENCES clientes(id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_processos_empresa
    FOREIGN KEY (empresa_id)
    REFERENCES empresas(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_processos_responsavel
    FOREIGN KEY (responsavel_usuario_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS historico_processos (
  id BIGSERIAL PRIMARY KEY,
  processo_id BIGINT NOT NULL,
  usuario_id BIGINT,
  status_anterior VARCHAR(30),
  status_novo VARCHAR(30),
  descricao TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_historico_processo
    FOREIGN KEY (processo_id)
    REFERENCES processos(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_historico_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS documentos (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL,
  processo_id BIGINT,
  nome_original VARCHAR(255) NOT NULL,
  nome_arquivo VARCHAR(255) NOT NULL,
  caminho_arquivo TEXT NOT NULL,
  tipo_mime VARCHAR(120),
  tamanho_bytes BIGINT,
  status VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_documentos_cliente
    FOREIGN KEY (cliente_id)
    REFERENCES clientes(id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_documentos_processo
    FOREIGN KEY (processo_id)
    REFERENCES processos(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sistemas (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  descricao TEXT,
  url_acesso TEXT,
  url_demonstracao TEXT,
  icone TEXT,
  categoria VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'DESENVOLVIMENTO',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acessos_sistemas (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL,
  sistema_id BIGINT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  inicio_acesso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fim_acesso TIMESTAMPTZ,
  observacoes TEXT,

  CONSTRAINT uq_cliente_sistema
    UNIQUE (cliente_id, sistema_id),

  CONSTRAINT fk_acessos_cliente
    FOREIGN KEY (cliente_id)
    REFERENCES clientes(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_acessos_sistema
    FOREIGN KEY (sistema_id)
    REFERENCES sistemas(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs_auditoria (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT,
  acao VARCHAR(100) NOT NULL,
  entidade VARCHAR(100),
  entidade_id BIGINT,
  ip VARCHAR(64),
  user_agent TEXT,
  dados_anteriores JSONB,
  dados_novos JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_logs_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS configuracoes (
  id BIGSERIAL PRIMARY KEY,
  chave VARCHAR(120) NOT NULL UNIQUE,
  valor JSONB,
  descricao TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email
  ON usuarios(email);

CREATE INDEX IF NOT EXISTS idx_usuarios_cpf
  ON usuarios(cpf);

CREATE INDEX IF NOT EXISTS idx_processos_cliente
  ON processos(cliente_id);

CREATE INDEX IF NOT EXISTS idx_processos_status
  ON processos(status);

CREATE INDEX IF NOT EXISTS idx_documentos_cliente
  ON documentos(cliente_id);

CREATE INDEX IF NOT EXISTS idx_logs_usuario
  ON logs_auditoria(usuario_id);

CREATE OR REPLACE FUNCTION atualizar_data_modificacao()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_atualizado_em ON usuarios;
CREATE TRIGGER trg_usuarios_atualizado_em
BEFORE UPDATE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_modificacao();

DROP TRIGGER IF EXISTS trg_clientes_atualizado_em ON clientes;
CREATE TRIGGER trg_clientes_atualizado_em
BEFORE UPDATE ON clientes
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_modificacao();

DROP TRIGGER IF EXISTS trg_empresas_atualizado_em ON empresas;
CREATE TRIGGER trg_empresas_atualizado_em
BEFORE UPDATE ON empresas
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_modificacao();

DROP TRIGGER IF EXISTS trg_processos_atualizado_em ON processos;
CREATE TRIGGER trg_processos_atualizado_em
BEFORE UPDATE ON processos
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_modificacao();

DROP TRIGGER IF EXISTS trg_sistemas_atualizado_em ON sistemas;
CREATE TRIGGER trg_sistemas_atualizado_em
BEFORE UPDATE ON sistemas
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_modificacao();