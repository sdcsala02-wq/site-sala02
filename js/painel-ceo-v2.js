(function () {
  "use strict";

  const API =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
      ? "http://127.0.0.1:3000"
      : "https://site-sala02-production.up.railway.app";

  async function requisicao(caminho) {
    const resposta = await fetch(
      API + caminho,
      {
        credentials: "include"
      }
    );

    let dados = {};

    try {
      dados = await resposta.json();
    } catch (_) {}

    if (!resposta.ok) {
      throw new Error(
        dados.erro ||
        "Falha ao consultar sistema."
      );
    }

    return dados;
  }

  async function iniciar() {
    try {

      const dados = await requisicao(
        "/api/auth/me"
      );

      const usuario =
        dados.usuario || dados;

      if (
        String(
          usuario.perfil || ""
        ).toUpperCase() !== "CEO"
      ) {
        location.href =
          "admin.html";

        return;
      }

      document.getElementById(
        "usuarioNome"
      ).textContent =
        usuario.nome || "CEO Sala 02";

      document.getElementById(
        "usuarioPerfil"
      ).textContent = "CEO";

      const primeiroNome =
        String(
          usuario.nome || "CEO"
        )
          .trim()
          .split(/\s+/)[0];

      document.getElementById(
        "boasVindas"
      ).textContent =
        "Bem-vindo, " +
        primeiroNome;

      const resumo = await requisicao(
        "/api/ceo/resumo"
      );

      document.getElementById(
        "totalClientes"
      ).textContent =
        resumo.clientes_total ?? 0;

      document.getElementById(
        "totalProcessos"
      ).textContent =
        resumo.processos_total ?? 0;

      document.getElementById(
        "totalPendencias"
      ).textContent =
        resumo.pendencias_total ?? 0;

    } catch (erro) {

      console.error(
        "Erro Dashboard CEO:",
        erro
      );
    }
  }

  iniciar();

})();
