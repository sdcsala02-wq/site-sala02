const fs = require("fs");
const path = require("path");
const pool = require("../config/database");

async function executarMigrations() {

  try {

    const pasta = path.join(__dirname, "migrations");

    const arquivos = fs
      .readdirSync(pasta)
      .filter(a => a.endsWith(".sql"))
      .sort();

    console.log("\n====================================");
    console.log("EXECUTANDO MIGRATIONS");
    console.log("====================================\n");

    for (const arquivo of arquivos) {

      console.log("Executando:", arquivo);

      const sql = fs.readFileSync(
        path.join(pasta, arquivo),
        "utf8"
      );

      await pool.query(sql);

      console.log("✓ OK\n");

    }

    console.log("====================================");
    console.log("BANCO ATUALIZADO COM SUCESSO");
    console.log("====================================");

  } catch (erro) {

    console.error("\nERRO NA MIGRATION\n");
    console.error(erro);

  } finally {

    await pool.end();

  }

}

executarMigrations();