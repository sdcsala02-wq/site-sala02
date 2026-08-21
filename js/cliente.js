(() => {
  "use strict";

  const API_PRODUCAO =
    "https://site-sala02-production.up.railway.app";

  const CHAVE_SESSAO =
    "clienteSala02";

  const host =
    String(window.location.hostname || "")
      .toLowerCase();

  const API =
    host === "localhost" ||
    host === "127.0.0.1"
      ? "http://127.0.0.1:3000"
      : API_PRODUCAO;

  function somenteNumeros(valor) {
    return String(valor || "")
      .replace(/\D/g, "");
  }

  function formatarCPF(valor) {
    const cpf = somenteNumeros(valor);

    if (cpf.length !== 11) {
      return valor || "---";
    }

    return cpf.replace(
      /(\d{3})(\d{3})(\d{3})(\d{2})/,
      "$1.$2.$3-$4"
    );
  }

  function formatarCNPJ(valor) {
    const cnpj = somenteNumeros(valor);

    if (cnpj.length !== 14) {
      return valor || "---";
    }

    return cnpj.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5"
    );
  }

  function formatarDocumento(valor) {
    const documento =
      somenteNumeros(valor);

    if (documento.length <= 11) {
      return documento
        .replace(
          /(\d{3})(\d)/,
          "$1.$2"
        )
        .replace(
          /(\d{3})(\d)/,
          "$1.$2"
        )
        .replace(
          /(\d{3})(\d{1,2})$/,
          "$1-$2"
        );
    }

    return documento
      .slice(0, 14)
      .replace(
        /(\d{2})(\d)/,
        "$1.$2"
      )
      .replace(
        /(\d{3})(\d)/,
        "$1.$2"
      )
      .replace(
        /(\d{3})(\d)/,
        "$1/$2"
      )
      .replace(
        /(\d{4})(\d{1,2})$/,
        "$1-$2"
      );
  }

  function formatarData(valor) {
    if (!valor) {
      return "Não informado";
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
      return "Não informado";
    }

    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        dateStyle: "short",
        timeStyle: "short"
      }
    ).format(data);
  }

  function formatarTamanho(bytes) {
    const tamanho = Number(bytes);

    if (
      !Number.isFinite(tamanho) ||
      tamanho <= 0
    ) {
      return "Tamanho não informado";
    }

    if (tamanho < 1024) {
      return `${tamanho} bytes`;
    }

    if (tamanho < 1024 * 1024) {
      return `${(
        tamanho / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      tamanho / 1024 / 1024
    ).toFixed(1)} MB`;
  }

  function elemento(
    tag,
    classe = "",
    texto = ""
  ) {
    const item =
      document.createElement(tag);

    if (classe) {
      item.className = classe;
    }

    if (texto) {
      item.textContent = texto;
    }

    return item;
  }

  function limparElemento(item) {
    while (item.firstChild) {
      item.removeChild(
        item.firstChild
      );
    }
  }

  function mostrarMensagem(
    texto,
    tipo = "error"
  ) {
    const mensagem =
      document.getElementById(
        "mensagem"
      );

    mensagem.className =
      "message " + tipo;

    mensagem.textContent = texto;
  }

  function limparMensagem() {
    const mensagem =
      document.getElementById(
        "mensagem"
      );

    mensagem.className = "message";
    mensagem.textContent = "";
  }

  function normalizarSessao(sessao) {
    if (
      !sessao ||
      typeof sessao !== "object"
    ) {
      return null;
    }

    return {
      login_via:
        sessao.login_via || "CPF",
      usuario:
        sessao.usuario || null,
      empresa:
        sessao.empresa || null
    };
  }

  function lerSessao() {
    let valor = null;

    try {
      valor =
        sessionStorage.getItem(
          CHAVE_SESSAO
        ) ||
        localStorage.getItem(
          CHAVE_SESSAO
        );
    } catch {
      limparSessao();
      return null;
    }

    if (!valor) {
      limparSessao();
      return null;
    }

    try {
      const sessao =
        normalizarSessao(
          JSON.parse(valor)
        );

      if (!sessao) {
        limparSessao();
        return null;
      }

      salvarSessao(sessao);
      return sessao;

    } catch {
      limparSessao();
      return null;
    }
  }

  function salvarSessao(sessao) {
    const sessaoSegura =
      normalizarSessao(sessao);

    if (!sessaoSegura) {
      return false;
    }

    let armazenada = false;

    try {
      sessionStorage.setItem(
        CHAVE_SESSAO,
        JSON.stringify(sessaoSegura)
      );

      armazenada = true;
    } catch {
      armazenada = false;
    }

    try {
      localStorage.removeItem(
        CHAVE_SESSAO
      );
    } catch {
      // O armazenamento legado pode estar indisponível.
    }

    return armazenada;
  }

  function limparSessao() {
    try {
      sessionStorage.removeItem(
        CHAVE_SESSAO
      );
    } catch {
      // O sessionStorage pode estar indisponível.
    }

    try {
      localStorage.removeItem(
        CHAVE_SESSAO
      );
    } catch {
      // O localStorage pode estar indisponível.
    }
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
    } catch {
      dados = {};
    }

    if (!resposta.ok) {
      const erro = new Error(
        dados.erro ||
        "Não foi possível concluir a solicitação."
      );

      erro.status = resposta.status;

      throw erro;
    }

    return dados;
  }

  function criarEstadoVazio(texto) {
    return elemento(
      "div",
      "empty",
      texto
    );
  }

  function criarItemDetalhe(
    titulo,
    descricao,
    complemento = ""
  ) {
    const item = elemento(
      "div",
      "portal-item"
    );

    item.appendChild(
      elemento(
        "strong",
        "",
        titulo || "Informação"
      )
    );

    if (descricao) {
      item.appendChild(
        elemento(
          "p",
          "",
          descricao
        )
      );
    }

    if (complemento) {
      item.appendChild(
        elemento(
          "small",
          "",
          complemento
        )
      );
    }

    return item;
  }

  function adicionarGrupo(
    destino,
    titulo,
    itens,
    criador
  ) {
    if (
      !Array.isArray(itens) ||
      itens.length === 0
    ) {
      return;
    }

    const grupo = elemento(
      "section",
      "portal-grupo"
    );

    grupo.appendChild(
      elemento(
        "h4",
        "",
        titulo
      )
    );

    itens.forEach((item) => {
      grupo.appendChild(
        criador(item)
      );
    });

    destino.appendChild(grupo);
  }

  async function carregarDetalhes(
    processoId,
    destino
  ) {
    limparElemento(destino);

    destino.appendChild(
      criarEstadoVazio(
        "Carregando detalhes..."
      )
    );

    try {
      const dados = await requisicao(
        "/api/portal/processos/" +
        processoId
      );

      limparElemento(destino);

      adicionarGrupo(
        destino,
        "Pendências",
        dados.pendencias,
        (pendencia) =>
          criarItemDetalhe(
            pendencia.titulo,
            pendencia.descricao,
            [
              pendencia.status,
              pendencia.prazo
                ? "Prazo: " +
                  formatarData(
                    pendencia.prazo
                  )
                : ""
            ]
              .filter(Boolean)
              .join(" · ")
          )
      );

      adicionarGrupo(
        destino,
        "Movimentações",
        dados.historico,
        (movimento) =>
          criarItemDetalhe(
            movimento.tipo_evento ||
            "Movimentação",
            movimento.descricao,
            formatarData(
              movimento.criado_em
            )
          )
      );

      adicionarGrupo(
        destino,
        "Documentos",
        dados.documentos,
        (documento) =>
          criarItemDetalhe(
            documento.nome_original,
            documento.categoria ||
            "Documento",
            [
              documento.status,
              formatarTamanho(
                documento.tamanho_bytes
              )
            ].join(" · ")
          )
      );

      adicionarGrupo(
        destino,
        "Protocolos",
        dados.protocolos,
        (protocolo) => {
          const item =
            criarItemDetalhe(
              protocolo.numero,
              protocolo.orgao ||
              "Órgão não informado",
              protocolo.tipo || ""
            );

          if (protocolo.url_consulta) {
            try {
              const url = new URL(
                protocolo.url_consulta
              );

              if (
                ["http:", "https:"]
                  .includes(url.protocol)
              ) {
                const link = elemento(
                  "a",
                  "portal-link",
                  "Consultar protocolo"
                );

                link.href = url.href;
                link.target = "_blank";
                link.rel =
                  "noopener noreferrer";

                item.appendChild(link);
              }
            } catch {
              return item;
            }
          }

          return item;
        }
      );

      adicionarGrupo(
        destino,
        "Mensagens",
        dados.mensagens,
        (mensagem) =>
          criarItemDetalhe(
            mensagem.tipo ||
            "Mensagem",
            mensagem.mensagem,
            formatarData(
              mensagem.criado_em
            )
          )
      );

      if (!destino.children.length) {
        destino.appendChild(
          criarEstadoVazio(
            "Nenhuma movimentação adicional disponível."
          )
        );
      }

    } catch (erro) {
      limparElemento(destino);

      destino.appendChild(
        criarEstadoVazio(
          erro.message
        )
      );
    }
  }

  function criarCartaoProcesso(
    processo
  ) {
    const cartao = elemento(
      "article",
      "processo"
    );

    const cabecalho = elemento(
      "div",
      "processo-cabecalho"
    );

    const tituloArea =
      elemento("div");

    tituloArea.appendChild(
      elemento(
        "small",
        "processo-codigo",
        processo.codigo_sdc ||
        processo.protocolo ||
        "Processo"
      )
    );

    tituloArea.appendChild(
      elemento(
        "h3",
        "",
        processo.titulo ||
        processo.tipo_servico ||
        "Processo Sala 02"
      )
    );

    cabecalho.append(
      tituloArea,
      elemento(
        "span",
        "status",
        processo.status ||
        "EM ANDAMENTO"
      )
    );

    cartao.appendChild(cabecalho);

    if (processo.descricao) {
      cartao.appendChild(
        elemento(
          "p",
          "",
          processo.descricao
        )
      );
    }

    const metadados = elemento(
      "div",
      "processo-meta"
    );

    metadados.appendChild(
      elemento(
        "span",
        "",
        "Atualizado: " +
        formatarData(
          processo.atualizado_em
        )
      )
    );

    if (processo.orgao_responsavel) {
      metadados.appendChild(
        elemento(
          "span",
          "",
          "Órgão: " +
          processo.orgao_responsavel
        )
      );
    }

    if (
      Number(
        processo.pendencias_cliente
      ) > 0
    ) {
      metadados.appendChild(
        elemento(
          "span",
          "processo-alerta",
          processo.pendencias_cliente +
          " pendência(s)"
        )
      );
    }

    cartao.appendChild(metadados);

    const detalhes = elemento(
      "details",
      "processo-detalhes"
    );

    const resumo = elemento(
      "summary",
      "",
      "Ver detalhes e movimentações"
    );

    const conteudo = elemento(
      "div",
      "processo-detalhes-conteudo"
    );

    detalhes.append(
      resumo,
      conteudo
    );

    detalhes.addEventListener(
      "toggle",
      () => {
        if (
          detalhes.open &&
          detalhes.dataset.carregado !==
            "true"
        ) {
          detalhes.dataset.carregado =
            "true";

          carregarDetalhes(
            processo.id,
            conteudo
          );
        }
      }
    );

    cartao.appendChild(detalhes);

    return cartao;
  }

  async function carregarProcessos() {
    const lista =
      document.getElementById(
        "listaProcessos"
      );

    limparElemento(lista);

    lista.appendChild(
      criarEstadoVazio(
        "Carregando processos..."
      )
    );

    try {
      const dados = await requisicao(
        "/api/portal/processos"
      );

      const processos =
        Array.isArray(dados.processos)
          ? dados.processos
          : [];

      document.getElementById(
        "totalProcessos"
      ).textContent =
        String(processos.length);

      limparElemento(lista);

      if (!processos.length) {
        lista.appendChild(
          criarEstadoVazio(
            "Nenhum processo disponível no momento."
          )
        );

        return;
      }

      processos.forEach((processo) => {
        lista.appendChild(
          criarCartaoProcesso(
            processo
          )
        );
      });

    } catch (erro) {
      document.getElementById(
        "totalProcessos"
      ).textContent = "0";

      limparElemento(lista);

      lista.appendChild(
        criarEstadoVazio(
          erro.message
        )
      );
    }
  }

  /* SALA02-DOCUMENTOS-PRIVADOS-INICIO */

  let csrfTokenPortal = null;


  async function obterCsrfPortal(
    forcar = false
  ) {

    if (
      csrfTokenPortal &&
      !forcar
    ) {
      return csrfTokenPortal;
    }

    const dados =
      await requisicao(
        "/api/auth/csrf",
        {
          method: "GET",
          cache: "no-store"
        }
      );

    if (
      !dados ||
      !dados.csrf_token
    ) {
      throw new Error(
        "Não foi possível obter a proteção CSRF."
      );
    }

    csrfTokenPortal =
      dados.csrf_token;

    return csrfTokenPortal;
  }


  function definirStatusUpload(
    texto,
    tipo = ""
  ) {

    const status =
      document.getElementById(
        "statusUploadDocumento"
      );

    if (!status) {
      return;
    }

    status.textContent =
      texto || "";

    if (tipo) {
      status.dataset.tipo =
        tipo;
    }
    else {
      delete status.dataset.tipo;
    }
  }


  async function carregarProcessosParaUpload() {

    const select =
      document.getElementById(
        "processoDocumento"
      );

    const botao =
      document.getElementById(
        "btnEnviarDocumento"
      );

    if (!select) {
      return;
    }

    limparElemento(
      select
    );

    const inicial =
      document.createElement(
        "option"
      );

    inicial.value = "";
    inicial.textContent =
      "Selecione um processo";

    select.appendChild(
      inicial
    );


    try {

      const dados =
        await requisicao(
          "/api/portal/processos",
          {
            cache: "no-store"
          }
        );

      const processos =
        Array.isArray(
          dados.processos
        )
          ? dados.processos
          : [];


      processos.forEach(
        (processo) => {

          const opcao =
            document.createElement(
              "option"
            );

          opcao.value =
            String(
              processo.id
            );

          const codigo =
            processo.codigo_sdc ||
            processo.protocolo ||
            "Processo";

          const titulo =
            processo.titulo ||
            processo.tipo_servico ||
            "Sala 02";

          opcao.textContent =
            codigo +
            " — " +
            titulo;

          select.appendChild(
            opcao
          );
        }
      );


      if (botao) {
        botao.disabled =
          !processos.length;
      }


      if (!processos.length) {
        definirStatusUpload(
          "Não há processo disponível para receber documento."
        );
      }

    } catch (erro) {

      if (botao) {
        botao.disabled = true;
      }

      definirStatusUpload(
        erro.message ||
        "Não foi possível carregar os processos.",
        "erro"
      );
    }
  }


  function criarFormDataDocumento(
    processoId,
    categoria,
    arquivo
  ) {

    const formulario =
      new FormData();

    formulario.append(
      "processo_id",
      processoId
    );

    formulario.append(
      "categoria",
      categoria
    );

    formulario.append(
      "documento",
      arquivo,
      arquivo.name
    );

    return formulario;
  }


  async function executarUploadDocumento(
    formulario,
    csrfToken
  ) {

    const resposta =
      await fetch(
        API +
        "/api/portal/documentos",
        {
          method: "POST",

          credentials:
            "include",

          cache:
            "no-store",

          headers: {
            "X-CSRF-Token":
              csrfToken
          },

          body:
            formulario
        }
      );


    let dados = {};

    try {
      dados =
        await resposta.json();
    }
    catch {
      dados = {};
    }


    return {
      resposta,
      dados
    };
  }


  async function enviarDocumento() {

    const processo =
      document.getElementById(
        "processoDocumento"
      );

    const categoria =
      document.getElementById(
        "categoriaDocumento"
      );

    const campoArquivo =
      document.getElementById(
        "arquivoDocumento"
      );

    const botao =
      document.getElementById(
        "btnEnviarDocumento"
      );


    if (
      !processo ||
      !categoria ||
      !campoArquivo ||
      !botao
    ) {
      return;
    }


    const processoId =
      processo.value;

    const arquivo =
      campoArquivo.files &&
      campoArquivo.files[0];


    if (!processoId) {

      definirStatusUpload(
        "Selecione o processo.",
        "erro"
      );

      processo.focus();
      return;
    }


    if (!arquivo) {

      definirStatusUpload(
        "Selecione o arquivo.",
        "erro"
      );

      campoArquivo.focus();
      return;
    }


    if (
      arquivo.size < 1 ||
      arquivo.size >
        5 * 1024 * 1024
    ) {

      definirStatusUpload(
        "O arquivo deve possuir no máximo 5 MB.",
        "erro"
      );

      return;
    }


    const extensao =
      String(
        arquivo.name ||
        ""
      )
        .toLowerCase()
        .split(".")
        .pop();


    if (
      ![
        "pdf",
        "jpg",
        "jpeg",
        "png"
      ].includes(
        extensao
      )
    ) {

      definirStatusUpload(
        "Envie somente PDF, JPG ou PNG.",
        "erro"
      );

      return;
    }


    try {

      botao.disabled = true;

      botao.textContent =
        "Enviando...";

      definirStatusUpload(
        "Enviando documento..."
      );


      let csrf =
        await obterCsrfPortal();


      let retorno =
        await executarUploadDocumento(
          criarFormDataDocumento(
            processoId,
            categoria.value.trim(),
            arquivo
          ),
          csrf
        );


      const erroCsrf =
        retorno.resposta.status ===
          403 &&
        String(
          retorno.dados.erro ||
          ""
        )
          .toUpperCase()
          .includes(
            "CSRF"
          );


      if (erroCsrf) {

        csrfTokenPortal =
          null;

        csrf =
          await obterCsrfPortal(
            true
          );


        retorno =
          await executarUploadDocumento(
            criarFormDataDocumento(
              processoId,
              categoria.value.trim(),
              arquivo
            ),
            csrf
          );
      }


      if (
        !retorno.resposta.ok
      ) {
        throw new Error(
          retorno.dados.erro ||
          "Não foi possível enviar o documento."
        );
      }


      campoArquivo.value =
        "";

      categoria.value =
        "";


      definirStatusUpload(
        "Documento enviado com sucesso.",
        "sucesso"
      );


      await carregarDocumentos();


    } catch (erro) {

      console.error(
        "Erro ao enviar documento:",
        erro
      );

      definirStatusUpload(
        erro.message ||
        "Não foi possível enviar o documento.",
        "erro"
      );


    } finally {

      botao.disabled =
        false;

      botao.textContent =
        "Enviar documento";
    }
  }


  async function baixarDocumento(
    documentoId,
    nomeOriginal
  ) {

    try {

      const resposta =
        await fetch(
          API +
          "/api/portal/documentos/" +
          documentoId +
          "/download",
          {
            method: "GET",

            credentials:
              "include",

            cache:
              "no-store"
          }
        );


      if (!resposta.ok) {

        let dados = {};

        try {
          dados =
            await resposta.json();
        }
        catch {
          dados = {};
        }

        throw new Error(
          dados.erro ||
          "Não foi possível baixar o documento."
        );
      }


      const blob =
        await resposta.blob();


      const url =
        URL.createObjectURL(
          blob
        );


      const link =
        document.createElement(
          "a"
        );


      link.href =
        url;

      link.download =
        String(
          nomeOriginal ||
          "documento"
        ).replace(
          /[\\/:*?"<>|]/g,
          "_"
        );


      document.body.appendChild(
        link
      );

      link.click();

      link.remove();


      window.setTimeout(
        () => {
          URL.revokeObjectURL(
            url
          );
        },
        1000
      );


    } catch (erro) {

      console.error(
        "Erro ao baixar documento:",
        erro
      );

      definirStatusUpload(
        erro.message ||
        "Não foi possível baixar o documento.",
        "erro"
      );
    }
  }

  /* SALA02-DOCUMENTOS-PRIVADOS-FIM */

  async function carregarDocumentos() {
    const lista =
      document.getElementById(
        "listaDocumentos"
      );

    if (!lista) {
      return;
    }

    limparElemento(lista);

    lista.appendChild(
      criarEstadoVazio(
        "Carregando documentos..."
      )
    );

    try {
      const dados = await requisicao(
        "/api/portal/documentos"
      );

      const documentos =
        Array.isArray(dados.documentos)
          ? dados.documentos
          : [];

      limparElemento(lista);

      if (!documentos.length) {
        lista.appendChild(
          criarEstadoVazio(
            "Nenhum documento disponível no momento."
          )
        );

        return;
      }

      documentos.forEach(
        (documento) => {

          const item =
            criarItemDetalhe(
              documento.nome_original,
              documento.processo_titulo ||
              documento.categoria ||
              "Documento",
              [
                documento.codigo_sdc,
                documento.status,
                formatarData(
                  documento.criado_em
                )
              ]
                .filter(Boolean)
                .join(" · ")
            );


          const acoes =
            document.createElement(
              "div"
            );

          acoes.className =
            "documento-acoes";


          const botaoBaixar =
            document.createElement(
              "button"
            );

          botaoBaixar.type =
            "button";

          botaoBaixar.className =
            "documento-baixar";

          botaoBaixar.textContent =
            "Baixar";


          botaoBaixar.addEventListener(
            "click",
            () => {

              baixarDocumento(
                documento.id,
                documento.nome_original
              );
            }
          );


          acoes.appendChild(
            botaoBaixar
          );

          item.appendChild(
            acoes
          );

          lista.appendChild(
            item
          );
        }
      );

    } catch (erro) {
      limparElemento(lista);

      lista.appendChild(
        criarEstadoVazio(
          erro.message
        )
      );
    }
  }

  async function abrirDashboard(
    sessao,
    usuarioAtualizado = null
  ) {
    const usuario =
      usuarioAtualizado ||
      sessao.usuario;

    const empresa =
      sessao.empresa || null;


    document.getElementById(
      "loginScreen"
    ).style.display = "none";

    document.getElementById(
      "dashboard"
    ).style.display = "block";

    document.getElementById(
      "nomeCliente"
    ).textContent =
      "Olá, " +
      (usuario.nome || "cliente");

    document.getElementById(
      "resumoNome"
    ).textContent =
      usuario.nome || "---";

    const loginVia =
      sessao.login_via || "CPF";

    const documento =
      loginVia === "CNPJ" &&
      empresa
        ? formatarCNPJ(
            empresa.cnpj
          )
        : formatarCPF(
            usuario.cpf
          );

    document.getElementById(
      "rotuloDocumento"
    ).textContent = loginVia;

    document.getElementById(
      "resumoDocumento"
    ).textContent = documento;

    document.getElementById(
      "clienteEmail"
    ).textContent =
      usuario.email ||
      "Não cadastrado";

    await Promise.all([
      carregarProcessos(),
      carregarDocumentos(),
      carregarProcessosParaUpload()
    ]);
  }

  function mostrarLogin() {
    document.getElementById(
      "dashboard"
    ).style.display = "none";

    document.getElementById(
      "loginScreen"
    ).style.display = "flex";
  }

  async function entrar() {
    const campoDocumento =
      document.getElementById(
        "documento"
      );

    const campoSenha =
      document.getElementById(
        "senha"
      );

    const botao =
      document.getElementById(
        "btnEntrar"
      );

    const loginCard =
      document.getElementById(
        "loginCard"
      );

    const documento =
      somenteNumeros(
        campoDocumento.value
      );

    const senha =
      campoSenha.value;

    limparMensagem();

    if (
      ![11, 14].includes(
        documento.length
      )
    ) {
      mostrarMensagem(
        "Informe um CPF ou CNPJ válido."
      );

      campoDocumento.focus();
      return;
    }

    if (!senha) {
      mostrarMensagem(
        "Informe sua senha."
      );

      campoSenha.focus();
      return;
    }

    try {
      botao.disabled = true;
      botao.textContent =
        "Acessando...";

      loginCard.classList.add(
        "loading"
      );

      const dados = await requisicao(
        "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            documento,
            senha
          })
        }
      );

      if (
        !dados.usuario ||
        dados.usuario.perfil !==
          "CLIENTE"
      ) {
        throw new Error(
          "Esta conta não pertence ao Portal do Cliente."
        );
      }

      const sessao = {
        login_via:
          dados.login_via || "CPF",
        usuario: dados.usuario,
        empresa:
          dados.empresa || null
      };

      salvarSessao(sessao);

      campoSenha.value = "";

      mostrarMensagem(
        "Acesso liberado.",
        "success"
      );

      await abrirDashboard(
        sessao
      );

    } catch (erro) {
      limparSessao();

      mostrarMensagem(
        erro.message ||
        "Não foi possível acessar."
      );

    } finally {
      botao.disabled = false;
      botao.textContent =
        "Acessar minha área";

      loginCard.classList.remove(
        "loading"
      );
    }
  }

  async function sair() {
    try {
      await requisicao(
        "/api/auth/logout",
        {
          method: "POST"
        }
      );
    } catch {
      // A sessão local será encerrada
      // mesmo se o servidor estiver indisponível.
    }

    limparSessao();
    limparMensagem();
    mostrarLogin();

    document.getElementById(
      "documento"
    ).focus();
  }

  async function restaurarSessao() {
    const sessaoSalva =
      lerSessao();


    try {
      const usuario =
        await requisicao(
          "/api/auth/me"
        );

      if (
        usuario.perfil !== "CLIENTE"
      ) {
        throw new Error(
          "Perfil não autorizado."
        );
      }

      const sessao = {

        login_via:
          sessaoSalva
            ? sessaoSalva.login_via
            : "CPF",

        usuario,

        empresa:
          sessaoSalva
            ? sessaoSalva.empresa
            : null
      };

      salvarSessao(sessao);

      await abrirDashboard(
        sessao,
        usuario
      );

    } catch {
      limparSessao();
      mostrarLogin();
    }
  }

  function iniciar() {
    const campoDocumento =
      document.getElementById(
        "documento"
      );

    const campoSenha =
      document.getElementById(
        "senha"
      );

    const botaoEntrar =
      document.getElementById(
        "btnEntrar"
      );

    const botaoSair =
      document.querySelector(
        ".logout"
      );

    botaoEntrar.addEventListener(
      "click",
      entrar
    );

    botaoSair.addEventListener(
      "click",
      sair
    );

    const botaoEnviarDocumento =
      document.getElementById(
        "btnEnviarDocumento"
      );

    if (botaoEnviarDocumento) {

      botaoEnviarDocumento.addEventListener(
        "click",
        enviarDocumento
      );
    }

    campoDocumento.addEventListener(
      "input",
      () => {
        campoDocumento.value =
          formatarDocumento(
            campoDocumento.value
          );
      }
    );

    campoSenha.addEventListener(
      "keydown",
      (evento) => {
        if (evento.key === "Enter") {
          entrar();
        }
      }
    );

    restaurarSessao();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      iniciar,
      { once: true }
    );
  }
  else {
    iniciar();
  }
})();