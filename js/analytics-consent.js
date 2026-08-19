(() => {
  "use strict";

  const ID_ANALYTICS = "G-N8RKCZLB35";
  const CHAVE_CONSENTIMENTO = "sala02_analytics_consent_v1";
  const VERSAO_CONSENTIMENTO = "1.0";

  const HOSTS_PRODUCAO = new Set([
    "site-sala02-production.up.railway.app",
    "sdcsala02.com.br",
    "www.sdcsala02.com.br"
  ]);

  let analyticsCarregado = false;

  window.dataLayer = window.dataLayer || [];

  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });

  window.gtag("set", "ads_data_redaction", true);

  function ambienteProducao() {
    return HOSTS_PRODUCAO.has(
      String(window.location.hostname || "").toLowerCase()
    );
  }

  function lerConsentimento() {
    try {
      const registro = JSON.parse(
        localStorage.getItem(CHAVE_CONSENTIMENTO)
      );

      if (
        !registro ||
        registro.versao !== VERSAO_CONSENTIMENTO ||
        !["aceito", "recusado"].includes(registro.valor)
      ) {
        return null;
      }

      return registro.valor;
    }
    catch {
      return null;
    }
  }

  function salvarConsentimento(valor) {
    try {
      localStorage.setItem(
        CHAVE_CONSENTIMENTO,
        JSON.stringify({
          valor,
          versao: VERSAO_CONSENTIMENTO,
          atualizado_em: new Date().toISOString()
        })
      );
    }
    catch {
      return false;
    }

    return true;
  }

  function carregarAnalytics() {
    if (analyticsCarregado || !ambienteProducao()) {
      return;
    }

    analyticsCarregado = true;

    window.gtag("consent", "update", {
      analytics_storage: "granted"
    });

    const script = document.createElement("script");

    script.async = true;
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(ID_ANALYTICS);

    script.addEventListener("load", () => {
      window.gtag("js", new Date());

      window.gtag("config", ID_ANALYTICS, {
        send_page_view: true,
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        cookie_flags: "SameSite=Lax;Secure"
      });
    });

    script.addEventListener("error", () => {
      analyticsCarregado = false;
    });

    document.head.appendChild(script);
  }

  function excluirCookiesAnalytics() {
    document.cookie
      .split(";")
      .map((item) => item.split("=")[0].trim())
      .filter((nome) => nome === "_ga" || nome.startsWith("_ga_"))
      .forEach((nome) => {
        document.cookie =
          nome +
          "=; Max-Age=0; path=/; SameSite=Lax";

        document.cookie =
          nome +
          "=; Max-Age=0; path=/; domain=" +
          window.location.hostname +
          "; SameSite=Lax";
      });
  }

  function recusarAnalytics() {
    window.gtag("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });

    excluirCookiesAnalytics();
  }

  function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);

    if (classe) {
      elemento.className = classe;
    }

    if (texto) {
      elemento.textContent = texto;
    }

    return elemento;
  }

  function montarInterface() {
    const painel = criarElemento(
      "section",
      "sala02-consent"
    );

    painel.id = "sala02Consentimento";
    painel.hidden = true;
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-modal", "false");
    painel.setAttribute(
      "aria-labelledby",
      "sala02ConsentimentoTitulo"
    );

    const conteudo = criarElemento(
      "div",
      "sala02-consent__content"
    );

    const textoArea = criarElemento("div");

    const titulo = criarElemento(
      "h2",
      "sala02-consent__title",
      "Sua privacidade importa"
    );

    titulo.id = "sala02ConsentimentoTitulo";

    const texto = criarElemento(
      "p",
      "sala02-consent__text"
    );

    texto.append(
      document.createTextNode(
        "Usamos métricas opcionais para entender visitas e melhorar o site. "
      )
    );

    const link = criarElemento(
      "a",
      "",
      "Política de Privacidade"
    );

    link.href = "politica-de-privacidade.html";

    texto.append(link, document.createTextNode("."));

    textoArea.append(titulo, texto);

    const acoes = criarElemento(
      "div",
      "sala02-consent__actions"
    );

    const botaoRecusar = criarElemento(
      "button",
      "sala02-consent__button sala02-consent__button--reject",
      "Recusar"
    );

    botaoRecusar.type = "button";

    const botaoAceitar = criarElemento(
      "button",
      "sala02-consent__button sala02-consent__button--accept",
      "Aceitar métricas"
    );

    botaoAceitar.type = "button";

    acoes.append(botaoRecusar, botaoAceitar);
    conteudo.append(textoArea, acoes);
    painel.appendChild(conteudo);

    const preferencias = criarElemento(
      "button",
      "sala02-privacy-settings",
      "Privacidade"
    );

    preferencias.type = "button";
    preferencias.hidden = true;
    preferencias.setAttribute(
      "aria-label",
      "Reabrir preferências de privacidade"
    );

    function abrirPainel() {
      painel.hidden = false;
      preferencias.hidden = true;
      botaoAceitar.focus();
    }

    function fecharPainel() {
      painel.hidden = true;
      preferencias.hidden = false;
    }

    botaoAceitar.addEventListener("click", () => {
      salvarConsentimento("aceito");
      carregarAnalytics();
      fecharPainel();
    });

    botaoRecusar.addEventListener("click", () => {
      salvarConsentimento("recusado");
      recusarAnalytics();
      fecharPainel();
    });

    preferencias.addEventListener("click", abrirPainel);

    document.body.append(painel, preferencias);

    const escolhaAtual = lerConsentimento();

    if (escolhaAtual === "aceito") {
      carregarAnalytics();
      preferencias.hidden = false;
      return;
    }

    if (escolhaAtual === "recusado") {
      recusarAnalytics();
      preferencias.hidden = false;
      return;
    }

    abrirPainel();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      montarInterface,
      { once: true }
    );
  }
  else {
    montarInterface();
  }
})();