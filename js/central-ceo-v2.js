(function () {

  const API =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
      ? "http://127.0.0.1:3000"
      : "https://site-sala02-production.up.railway.app";

  let usuarios = [];

  function escapar(valor) {
    return String(valor || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  async function validarCEO() {

    const resposta = await fetch(
      API + "/api/auth/me",
      {
        credentials: "include"
      }
    );

    if (!resposta.ok) {
      location.href = "admin.html";
      return null;
    }

    const dados = await resposta.json();

    const usuario =
      dados.usuario || dados;

    if (
      String(usuario.perfil || "").toUpperCase()
      !== "CEO"
    ) {
      location.href = "admin.html";
      return null;
    }

    const nome =
      document.getElementById("usuarioNome");

    const perfil =
      document.getElementById("usuarioPerfil");

    if (nome) {
      nome.textContent =
        usuario.nome || "CEO Sala 02";
    }

    if (perfil) {
      perfil.textContent = "CEO";
    }

    return usuario;
  }

  function renderizar() {

    const corpo =
      document.getElementById(
        "usuariosTabela"
      );

    if (!corpo) {
      return;
    }

    const busca =
      document.getElementById(
        "buscaUsuario"
      ).value
        .trim()
        .toLowerCase();

    const status =
      document.getElementById(
        "filtroStatus"
      ).value;

    const perfil =
      document.getElementById(
        "filtroPerfil"
      ).value;

    const lista =
      usuarios.filter(usuario => {

        const texto = [
          usuario.nome,
          usuario.email,
          usuario.cpf,
          usuario.perfil
        ]
          .join(" ")
          .toLowerCase();

        if (
          busca &&
          !texto.includes(busca)
        ) {
          return false;
        }

        if (
          status &&
          usuario.status !== status
        ) {
          return false;
        }

        if (
          perfil &&
          usuario.perfil !== perfil
        ) {
          return false;
        }

        return true;
      });

    corpo.innerHTML = "";

    if (!lista.length) {

      const linha =
        document.createElement("tr");

      linha.innerHTML =
        '<td colspan="6" class="empty">' +
        'Nenhum usuário encontrado.' +
        '</td>';

      corpo.appendChild(linha);

      return;
    }

    lista.forEach(usuario => {

      const linha =
        document.createElement("tr");

      const ativo =
        String(usuario.status)
          .toUpperCase() === "ATIVO";

      linha.innerHTML = `
        <td>
          <strong>${escapar(usuario.nome)}</strong>
          <br>
          <small>ID ${escapar(usuario.id)}</small>
        </td>

        <td>
          ${escapar(usuario.email)}
        </td>

        <td>
          ${escapar(usuario.perfil)}
        </td>

        <td>
          <span class="badge ${
            ativo
              ? "badge-active"
              : "badge-inactive"
          }">
            ${escapar(usuario.status)}
          </span>
        </td>

        <td>
          ${
            usuario.ultimo_login
              ? new Date(
                  usuario.ultimo_login
                ).toLocaleString("pt-BR")
              : "Nunca acessou"
          }
        </td>

        <td>
          <div class="action-buttons">
            <button type="button">
              Editar
            </button>

            <button type="button">
              Senha
            </button>

            <button type="button">
              ${
                ativo
                  ? "Inativar"
                  : "Ativar"
              }
            </button>
          </div>
        </td>
      `;

      corpo.appendChild(linha);

    });

  }

  async function iniciar() {

    const usuario =
      await validarCEO();

    if (!usuario) {
      return;
    }

    /*
      Integração completa dos usuários será
      conectada à API administrativa existente
      na próxima etapa.
    */

    usuarios = [
      {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        cpf: usuario.cpf,
        perfil: usuario.perfil,
        status: usuario.status || "ATIVO",
        ultimo_login:
          usuario.ultimo_login || null
      }
    ];

    document.getElementById(
      "usuariosTotal"
    ).textContent = usuarios.length;

    document.getElementById(
      "usuariosAtivos"
    ).textContent =
      usuarios.filter(
        u => u.status === "ATIVO"
      ).length;

    document.getElementById(
      "usuariosClientes"
    ).textContent =
      usuarios.filter(
        u => u.perfil === "CLIENTE"
      ).length;

    document.getElementById(
      "usuariosInativos"
    ).textContent =
      usuarios.filter(
        u => u.status !== "ATIVO"
      ).length;

    document.getElementById(
      "buscaUsuario"
    ).addEventListener(
      "input",
      renderizar
    );

    document.getElementById(
      "filtroStatus"
    ).addEventListener(
      "change",
      renderizar
    );

    document.getElementById(
      "filtroPerfil"
    ).addEventListener(
      "change",
      renderizar
    );

    renderizar();

  }

  iniciar();

})();
