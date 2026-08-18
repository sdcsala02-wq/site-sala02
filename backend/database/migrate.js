require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const pool = require("../config/database");

const MIGRATION_BASELINE = "001_estrutura_inicial.sql";

function gerarChecksum(conteudo) {
  return crypto
    .createHash("sha256")
    .update(conteudo, "utf8")
    .digest("hex");
}

async function garantirControleMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      executada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function estruturaInicialJaExiste(client) {
  const resultado = await client.query(`
    SELECT
      to_regclass('public.usuarios') AS usuarios,
      to_regclass('public.clientes') AS clientes,
      to_regclass('public.empresas') AS empresas,
      to_regclass('public.processos') AS processos
  `);

  const estrutura = resultado.rows[0];

  return Boolean(
    estrutura.usuarios &&
    estrutura.clientes &&
    estrutura.empresas &&
    estrutura.processos
  );
}

async function executarMigrations() {
  const client = await pool.connect();

  try {
    const pasta = path.join(__dirname, "migrations");

    const arquivos = fs
      .readdirSync(pasta)
      .filter((arquivo) => arquivo.endsWith(".sql"))
      .sort();

    console.log("");
    console.log("========================================");
    console.log(" SDC SALA 02 - MIGRATIONS POSTGRESQL");
    console.log("========================================");

    await garantirControleMigrations(client);

    const migrationsRegistradas = await client.query(`
      SELECT nome, checksum
      FROM schema_migrations
      ORDER BY nome
    `);

    const executadas = new Map(
      migrationsRegistradas.rows.map((item) => [
        item.nome,
        item.checksum.trim()
      ])
    );

    for (const arquivo of arquivos) {
      const caminho = path.join(pasta, arquivo);
      const sql = fs.readFileSync(caminho, "utf8");
      const checksum = gerarChecksum(sql);

      if (executadas.has(arquivo)) {
        const checksumRegistrado = executadas.get(arquivo);

        if (checksumRegistrado !== checksum) {
          throw new Error(
            `A migration ${arquivo} foi alterada depois de executada.`
          );
        }

        console.log(`- ${arquivo}: já executada`);
        continue;
      }

      if (
        arquivo === MIGRATION_BASELINE &&
        await estruturaInicialJaExiste(client)
      ) {
        await client.query(
          `
            INSERT INTO schema_migrations (
              nome,
              checksum
            )
            VALUES ($1, $2)
          `,
          [arquivo, checksum]
        );

        console.log(
          `✓ ${arquivo}: registrada como baseline`
        );

        continue;
      }

      console.log(`Executando: ${arquivo}`);

      try {
        await client.query("BEGIN");

        await client.query(sql);

        await client.query(
          `
            INSERT INTO schema_migrations (
              nome,
              checksum
            )
            VALUES ($1, $2)
          `,
          [arquivo, checksum]
        );

        await client.query("COMMIT");

        console.log(`✓ ${arquivo}: OK`);
      } catch (erro) {
        await client.query("ROLLBACK");
        throw erro;
      }
    }

    console.log("");
    console.log("========================================");
    console.log(" MIGRATIONS ATUALIZADAS COM SUCESSO");
    console.log("========================================");
  } catch (erro) {
    console.error("");
    console.error("ERRO NA MIGRATION:");
    console.error(erro.message);

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

executarMigrations();
