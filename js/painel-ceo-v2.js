(function () {

  const API =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
      ? "http://127.0.0.1:3000"
      : "https://site-sala02-production.up.railway.app";

  async function carregarUsuario() {

    try {

      const resposta = await fetch(
        API + "/api/auth/me",
        {
          credentials: "include"
        }
      );

      if (!resposta.ok) {
        location.href = "admin.html";
        return;
      }

      const dados = await resposta.json();

      const usuario =
        dados.usuario || dados;

      if (
        String(usuario.perfil || "").toUpperCase()
        !== "CEO"
      ) {
        location.href = "admin.html";
        return;
      }

      const nome =
        document.getElementById("usuarioNome");

      const perfil =
        document.getElementById("usuarioPerfil");

      const boasVindas =
        document.getElementById("boasVindas");

      if (nome) {
        nome.textContent =
          usuario.nome || "CEO Sala 02";
      }

      if (perfil) {
        perfil.textContent =
          usuario.perfil || "CEO";
      }

      if (boasVindas) {
        boasVindas.textContent =
          "Bem-vindo, " +
          String(usuario.nome || "CEO")
            .split(" ")[0];
      }

    }
    catch (erro) {

      console.error(
        "Falha ao validar sessão:",
        erro
      );

    }

  }

  carregarUsuario();

})();
