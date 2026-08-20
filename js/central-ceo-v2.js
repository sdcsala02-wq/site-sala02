(function () {
  "use strict";

  const API =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
      ? "http://127.0.0.1:3000"
      : "https://site-sala02-production.up.railway.app";

  let usuarios = [];
  let csrfToken = null;

  function somenteNumeros(valor) {
    return String(valor || "").replace(/\D/g, "");
  }

  function dataBr(valor) {
    if (!valor) {
      return "Nunca acessou";
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
      return "-";
    }

    return data.toLocaleString("pt-BR");
  }

  async function requisicao(
    caminho,
    opcoes = {}
  ) {
    const resposta = await fetch(
      API + caminho,
      {
        ...opcoes,
        credentials: "include",
        headers: {
          ...(opcoes.headers || {})
        }
      }
    );

    let dados = {};

    try {
      dados = await resposta.json();
    } catch (_) {}

    if (!resposta.ok) {
      throw new Error(
        dados.erro ||
        dados.mensagem ||
        "Não foi possível concluir a operação."
      );
    }

    return dados;
  }

  async function obterCsrf(
    renovar = false
  ) {
    if (csrfToken && !renovar) {
      return csrfToken;
    }

    const dados = await requisicao(
      "/api/auth/csrf"
    );

    csrfToken = dados.csrf_token;

    if (!csrfToken) {
      throw new Error(
        "Falha ao obter proteção CSRF."
      );
    }

    return csrfToken;
  }

  async function mutacao(
    caminho,
    metodo,
    dados
  ) {
    let token = await obterCsrf();

    try {
      return await requisicao(
        caminho,
        {
          method: metodo,
          headers: {
            "Content-Type":
              "application/json",
            "X-CSRF-Token":
              token
          },
          body:
            JSON.stringify(dados)
        }
      );
    } catch (erro) {

      if (
        String(erro.message)
          .toUpperCase()
          .includes("CSRF")
      ) {
        csrfToken = null;
        token = await obterCsrf(true);

        return requisicao(
          caminho,
          {
            method: metodo,
            headers: {
              "Content-Type":
                "application/json",
              "X-CSRF-Token":
                token
            },
            body:
              JSON.stringify(dados)
          }
        );
      }

      throw erro;
    }
  }

  function mensagem(
    texto,
    erro = false
  ) {
    let box =
      document.getElementById(
        "mensagemCentralCEO"
      );

    if (!box) {
      box = document.createElement("div");

      box.id =
        "mensagemCentralCEO";

      box.className =
        "central-feedback";

      const painel =
        document.querySelector(
          ".content .panel"
        );

      painel.insertBefore(
        box,
        painel.children[1] || null
      );
    }

    box.textContent = texto;

    box.className =
      "central-feedback " +
      (erro
        ? "central-feedback-error"
        : "central-feedback-ok");

    box.hidden = false;

    window.clearTimeout(
      mensagem.timer
    );

    mensagem.timer =
      window.setTimeout(
        () => {
          box.hidden = true;
        },
        4500
      );
  }

  async function validarCEO() {
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

      return false;
    }

    const nome =
      document.getElementById(
        "usuarioNome"
      );

    const perfil =
      document.getElementById(
        "usuarioPerfil"
      );

    if (nome) {
      nome.textContent =
        usuario.nome || "CEO Sala 02";
    }

    if (perfil) {
      perfil.textContent = "CEO";
    }

    return true;
  }

  async function carregarResumo() {
    const dados = await requisicao(
      "/api/ceo/resumo"
    );

    document.getElementById(
      "usuariosTotal"
    ).textContent =
      dados.usuarios_total ?? 0;

    document.getElementById(
      "usuariosAtivos"
    ).textContent =
      dados.usuarios_ativos ?? 0;

    document.getElementById(
      "usuariosClientes"
    ).textContent =
      dados.usuarios_clientes ?? 0;

    document.getElementById(
      "usuariosInativos"
    ).textContent =
      dados.usuarios_inativos ?? 0;
  }

  async function carregarUsuarios() {
    const dados = await requisicao(
      "/api/ceo/usuarios"
    );

    usuarios =
      Array.isArray(dados.usuarios)
        ? dados.usuarios
        : [];

    renderizar();
  }

  function textoBusca(usuario) {
    return [
      usuario.nome,
      usuario.email,
      usuario.cpf,
      usuario.cnpj,
      usuario.razao_social,
      usuario.nome_fantasia,
      usuario.perfil,
      usuario.status
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function criarBotao(
    titulo,
    callback,
    classe
  ) {
    const botao =
      document.createElement(
        "button"
      );

    botao.type = "button";
    botao.textContent = titulo;

    if (classe) {
      botao.classList.add(classe);
    }

    botao.addEventListener(
      "click",
      callback
    );

    return botao;
  }

  function renderizar() {
    const corpo =
      document.getElementById(
        "usuariosTabela"
      );

    const busca =
      String(
        document.getElementById(
          "buscaUsuario"
        ).value || ""
      )
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

    const lista = usuarios.filter(
      usuario => {

        if (
          busca &&
          !textoBusca(
            usuario
          ).includes(busca)
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
      }
    );

    corpo.replaceChildren();

    if (!lista.length) {
      const tr =
        document.createElement("tr");

      const td =
        document.createElement("td");

      td.colSpan = 6;
      td.className = "empty";
      td.textContent =
        "Nenhum usuário encontrado.";

      tr.appendChild(td);
      corpo.appendChild(tr);

      return;
    }

    lista.forEach(usuario => {

      const tr =
        document.createElement("tr");

      const tdUsuario =
        document.createElement("td");

      const nome =
        document.createElement(
          "strong"
        );

      nome.textContent =
        usuario.nome || "-";

      const detalhe =
        document.createElement(
          "small"
        );

      detalhe.className =
        "ceo-table-detail";

      const empresa =
        usuario.nome_fantasia ||
        usuario.razao_social ||
        "";

      detalhe.textContent =
        empresa
          ? empresa
          : usuario.cpf
            ? "CPF " + usuario.cpf
            : "ID " + usuario.id;

      tdUsuario.append(
        nome,
        detalhe
      );

      tr.appendChild(
        tdUsuario
      );

      const tdEmail =
        document.createElement("td");

      tdEmail.textContent =
        usuario.email || "-";

      tr.appendChild(tdEmail);

      const tdPerfil =
        document.createElement("td");

      tdPerfil.textContent =
        usuario.perfil || "-";

      tr.appendChild(tdPerfil);

      const tdStatus =
        document.createElement("td");

      const badge =
        document.createElement(
          "span"
        );

      const ativo =
        usuario.status === "ATIVO";

      badge.className =
        "badge " +
        (ativo
          ? "badge-active"
          : "badge-inactive");

      badge.textContent =
        usuario.status || "-";

      tdStatus.appendChild(badge);

      tr.appendChild(tdStatus);

      const tdAcesso =
        document.createElement("td");

      tdAcesso.textContent =
        dataBr(
          usuario.ultimo_login
        );

      tr.appendChild(tdAcesso);

      const tdAcoes =
        document.createElement("td");

      const acoes =
        document.createElement("div");

      acoes.className =
        "action-buttons";

      acoes.appendChild(
        criarBotao(
          "Editar",
          () => abrirCadastro(usuario)
        )
      );

      acoes.appendChild(
        criarBotao(
          "Senha",
          () => abrirSenha(usuario)
        )
      );

      if (
        usuario.perfil !== "CEO"
      ) {
        acoes.appendChild(
          criarBotao(
            ativo
              ? "Inativar"
              : "Ativar",
            () =>
              alterarStatus(usuario),
            ativo
              ? "acao-perigo"
              : "acao-sucesso"
          )
        );
      }

      tdAcoes.appendChild(acoes);
      tr.appendChild(tdAcoes);

      corpo.appendChild(tr);
    });
  }

  function garantirDialogCadastro() {
    let dialog =
      document.getElementById(
        "ceoDialogCadastro"
      );

    if (dialog) {
      return dialog;
    }

    dialog =
      document.createElement(
        "dialog"
      );

    dialog.id =
      "ceoDialogCadastro";

    dialog.className =
      "ceo-dialog";

    dialog.innerHTML = `
      <form id="ceoFormCadastro" class="ceo-modal">
        <div class="ceo-modal-header">
          <div>
            <span class="eyebrow">CENTRAL CEO</span>
            <h2 id="ceoModalTitulo">Novo cliente</h2>
          </div>

          <button
            type="button"
            class="ceo-close"
            id="ceoFecharCadastro"
          >×</button>
        </div>

        <input type="hidden" id="ceoUsuarioId">

        <div class="ceo-form-section">
          <h3>Dados do usuário</h3>

          <div class="ceo-form-grid">

            <label class="ceo-field ceo-wide">
              <span>Nome completo</span>
              <input id="ceoNome" required>
            </label>

            <label class="ceo-field">
              <span>CPF</span>
              <input id="ceoCpf" required>
            </label>

            <label class="ceo-field">
              <span>Telefone</span>
              <input id="ceoTelefone">
            </label>

            <label class="ceo-field ceo-wide">
              <span>E-mail</span>
              <input
                id="ceoEmail"
                type="email"
                required
              >
            </label>

            <label
              class="ceo-field"
              id="ceoGrupoTipo"
            >
              <span>Tipo</span>

              <select id="ceoTipoPessoa">
                <option value="PF">
                  Pessoa Física
                </option>

                <option value="PJ">
                  Pessoa Jurídica
                </option>
              </select>
            </label>

          </div>
        </div>

        <div
          class="ceo-form-section"
          id="ceoEmpresa"
        >
          <h3>Dados da empresa</h3>

          <div class="ceo-form-grid">

            <label class="ceo-field">
              <span>CNPJ</span>
              <input id="ceoCnpj">
            </label>

            <label class="ceo-field">
              <span>Inscrição Municipal</span>
              <input id="ceoIm">
            </label>

            <label class="ceo-field ceo-wide">
              <span>Razão Social</span>
              <input id="ceoRazao">
            </label>

            <label class="ceo-field ceo-wide">
              <span>Nome Fantasia</span>
              <input id="ceoFantasia">
            </label>

            <label class="ceo-field">
              <span>Inscrição Estadual</span>
              <input id="ceoIe">
            </label>

          </div>
        </div>

        <div
          class="ceo-form-section"
          id="ceoSenhaInicial"
        >
          <h3>Senha inicial</h3>

          <p class="ceo-help">
            Mínimo de 10 caracteres,
            com letra maiúscula,
            minúscula e número.
          </p>

          <div class="ceo-form-grid">

            <label class="ceo-field">
              <span>Senha</span>
              <input
                id="ceoSenha"
                type="password"
                autocomplete="new-password"
              >
            </label>

            <label class="ceo-field">
              <span>Confirmar senha</span>
              <input
                id="ceoSenha2"
                type="password"
                autocomplete="new-password"
              >
            </label>

          </div>
        </div>

        <div class="ceo-modal-actions">

          <button
            type="button"
            class="btn ceo-btn-cancelar"
            id="ceoCancelarCadastro"
          >
            Cancelar
          </button>

          <button
            type="submit"
            class="btn btn-primary"
          >
            Salvar
          </button>

        </div>
      </form>
    `;

    document.body.appendChild(
      dialog
    );

    document.getElementById(
      "ceoFecharCadastro"
    ).addEventListener(
      "click",
      () => dialog.close()
    );

    document.getElementById(
      "ceoCancelarCadastro"
    ).addEventListener(
      "click",
      () => dialog.close()
    );

    document.getElementById(
      "ceoTipoPessoa"
    ).addEventListener(
      "change",
      atualizarEmpresa
    );

    document.getElementById(
      "ceoFormCadastro"
    ).addEventListener(
      "submit",
      salvarCadastro
    );

    return dialog;
  }

  function preencher(id, valor) {
    document.getElementById(
      id
    ).value =
      valor == null
        ? ""
        : String(valor);
  }

  function atualizarEmpresa() {
    const id =
      document.getElementById(
        "ceoUsuarioId"
      ).value;

    if (id) {
      return;
    }

    const tipo =
      document.getElementById(
        "ceoTipoPessoa"
      ).value;

    document.getElementById(
      "ceoEmpresa"
    ).hidden =
      tipo !== "PJ";
  }

  function abrirCadastro(
    usuario = null
  ) {
    const dialog =
      garantirDialogCadastro();

    document.getElementById(
      "ceoFormCadastro"
    ).reset();

    preencher(
      "ceoUsuarioId",
      usuario
        ? usuario.id
        : ""
    );

    document.getElementById(
      "ceoModalTitulo"
    ).textContent =
      usuario
        ? "Editar cadastro"
        : "Novo cliente";

    document.getElementById(
      "ceoGrupoTipo"
    ).hidden =
      Boolean(usuario);

    document.getElementById(
      "ceoSenhaInicial"
    ).hidden =
      Boolean(usuario);

    if (usuario) {

      preencher(
        "ceoNome",
        usuario.nome
      );

      preencher(
        "ceoCpf",
        usuario.cpf
      );

      preencher(
        "ceoTelefone",
        usuario.telefone
      );

      preencher(
        "ceoEmail",
        usuario.email
      );

      preencher(
        "ceoTipoPessoa",
        usuario.tipo_pessoa || "PF"
      );

      preencher(
        "ceoCnpj",
        usuario.cnpj
      );

      preencher(
        "ceoRazao",
        usuario.razao_social
      );

      preencher(
        "ceoFantasia",
        usuario.nome_fantasia
      );

      preencher(
        "ceoIm",
        usuario.inscricao_municipal
      );

      preencher(
        "ceoIe",
        usuario.inscricao_estadual
      );

      document.getElementById(
        "ceoEmpresa"
      ).hidden =
        !usuario.empresa_id;

    } else {

      document.getElementById(
        "ceoTipoPessoa"
      ).value = "PF";

      atualizarEmpresa();
    }

    dialog.showModal();
  }

  async function salvarCadastro(
    evento
  ) {
    evento.preventDefault();

    const id =
      document.getElementById(
        "ceoUsuarioId"
      ).value;

    const novo = !id;

    const dados = {
      nome:
        document.getElementById(
          "ceoNome"
        ).value.trim(),

      cpf:
        somenteNumeros(
          document.getElementById(
            "ceoCpf"
          ).value
        ),

      telefone:
        somenteNumeros(
          document.getElementById(
            "ceoTelefone"
          ).value
        ),

      email:
        document.getElementById(
          "ceoEmail"
        ).value.trim(),

      tipo_pessoa:
        document.getElementById(
          "ceoTipoPessoa"
        ).value,

      cnpj:
        somenteNumeros(
          document.getElementById(
            "ceoCnpj"
          ).value
        ),

      razao_social:
        document.getElementById(
          "ceoRazao"
        ).value.trim(),

      nome_fantasia:
        document.getElementById(
          "ceoFantasia"
        ).value.trim(),

      inscricao_municipal:
        document.getElementById(
          "ceoIm"
        ).value.trim(),

      inscricao_estadual:
        document.getElementById(
          "ceoIe"
        ).value.trim()
    };

    if (novo) {

      const senha =
        document.getElementById(
          "ceoSenha"
        ).value;

      const confirmacao =
        document.getElementById(
          "ceoSenha2"
        ).value;

      if (senha !== confirmacao) {
        mensagem(
          "As senhas não conferem.",
          true
        );

        return;
      }

      dados.senha = senha;
    }

    try {

      if (novo) {

        await mutacao(
          "/api/ceo/usuarios",
          "POST",
          dados
        );

      } else {

        await mutacao(
          "/api/ceo/usuarios/" +
            encodeURIComponent(id),
          "PUT",
          dados
        );
      }

      document.getElementById(
        "ceoDialogCadastro"
      ).close();

      mensagem(
        novo
          ? "Cliente criado com sucesso."
          : "Cadastro atualizado com sucesso."
      );

      await Promise.all([
        carregarResumo(),
        carregarUsuarios()
      ]);

    } catch (erro) {

      mensagem(
        erro.message,
        true
      );
    }
  }

  function garantirDialogSenha() {
    let dialog =
      document.getElementById(
        "ceoDialogSenha"
      );

    if (dialog) {
      return dialog;
    }

    dialog =
      document.createElement(
        "dialog"
      );

    dialog.id =
      "ceoDialogSenha";

    dialog.className =
      "ceo-dialog ceo-dialog-small";

    dialog.innerHTML = `
      <form id="ceoFormSenha" class="ceo-modal">

        <div class="ceo-modal-header">
          <div>
            <span class="eyebrow">
              SEGURANÇA DA CONTA
            </span>

            <h2>Redefinir senha</h2>

            <p id="ceoSenhaNome"></p>
          </div>

          <button
            type="button"
            class="ceo-close"
            id="ceoFecharSenha"
          >×</button>
        </div>

        <input
          type="hidden"
          id="ceoSenhaUsuarioId"
        >

        <div class="ceo-form-grid ceo-senha-grid">

          <label class="ceo-field">
            <span>Nova senha</span>

            <input
              id="ceoNovaSenha"
              type="password"
              autocomplete="new-password"
              required
            >
          </label>

          <label class="ceo-field">
            <span>Confirmar senha</span>

            <input
              id="ceoNovaSenha2"
              type="password"
              autocomplete="new-password"
              required
            >
          </label>

        </div>

        <p class="ceo-help">
          A senha atual nunca é exibida.
          A nova senha será armazenada
          somente como hash seguro.
        </p>

        <div class="ceo-modal-actions">

          <button
            type="button"
            class="btn ceo-btn-cancelar"
            id="ceoCancelarSenha"
          >
            Cancelar
          </button>

          <button
            type="submit"
            class="btn btn-primary"
          >
            Redefinir senha
          </button>

        </div>

      </form>
    `;

    document.body.appendChild(
      dialog
    );

    document.getElementById(
      "ceoFecharSenha"
    ).addEventListener(
      "click",
      () => dialog.close()
    );

    document.getElementById(
      "ceoCancelarSenha"
    ).addEventListener(
      "click",
      () => dialog.close()
    );

    document.getElementById(
      "ceoFormSenha"
    ).addEventListener(
      "submit",
      salvarSenha
    );

    return dialog;
  }

  function abrirSenha(usuario) {
    const dialog =
      garantirDialogSenha();

    preencher(
      "ceoSenhaUsuarioId",
      usuario.id
    );

    document.getElementById(
      "ceoSenhaNome"
    ).textContent =
      usuario.nome || "";

    preencher(
      "ceoNovaSenha",
      ""
    );

    preencher(
      "ceoNovaSenha2",
      ""
    );

    dialog.showModal();
  }

  async function salvarSenha(
    evento
  ) {
    evento.preventDefault();

    const id =
      document.getElementById(
        "ceoSenhaUsuarioId"
      ).value;

    const senha =
      document.getElementById(
        "ceoNovaSenha"
      ).value;

    const confirmacao =
      document.getElementById(
        "ceoNovaSenha2"
      ).value;

    if (senha !== confirmacao) {
      mensagem(
        "As senhas não conferem.",
        true
      );

      return;
    }

    try {

      await mutacao(
        "/api/ceo/usuarios/" +
          encodeURIComponent(id) +
          "/senha",
        "PUT",
        {
          senha
        }
      );

      document.getElementById(
        "ceoDialogSenha"
      ).close();

      mensagem(
        "Senha redefinida com sucesso."
      );

      await carregarUsuarios();

    } catch (erro) {

      mensagem(
        erro.message,
        true
      );
    }
  }

  async function alterarStatus(
    usuario
  ) {
    const status =
      usuario.status === "ATIVO"
        ? "INATIVO"
        : "ATIVO";

    const acao =
      status === "ATIVO"
        ? "ativar"
        : "inativar";

    if (
      !window.confirm(
        `Deseja ${acao} a conta de ${usuario.nome}?`
      )
    ) {
      return;
    }

    try {

      await mutacao(
        "/api/ceo/usuarios/" +
          encodeURIComponent(
            usuario.id
          ) +
          "/status",
        "PATCH",
        {
          status
        }
      );

      mensagem(
        status === "ATIVO"
          ? "Usuário ativado."
          : "Usuário inativado."
      );

      await Promise.all([
        carregarResumo(),
        carregarUsuarios()
      ]);

    } catch (erro) {

      mensagem(
        erro.message,
        true
      );
    }
  }

  async function iniciar() {
    try {

      const autorizado =
        await validarCEO();

      if (!autorizado) {
        return;
      }

      const botaoNovo =
        document.getElementById(
          "btnNovoUsuario"
        );

      botaoNovo.textContent =
        "+ Novo cliente";

      botaoNovo.addEventListener(
        "click",
        () => abrirCadastro()
      );

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

      await Promise.all([
        carregarResumo(),
        carregarUsuarios(),
        obterCsrf()
      ]);

    } catch (erro) {

      console.error(
        "Erro Central CEO:",
        erro
      );

      mensagem(
        erro.message,
        true
      );
    }
  }

  iniciar();

})();
