// ═══════════════════════════════════════════════════════════════════════════════
// GSS — sessão do colaborador nos formulários externos (gss-sessao.js)
// Fonte única em dist/shared; os deploys copiam para livro-remoto e
// gss-requisicoes. Carregar ANTES dos demais scripts da página:
//   <script src="gss-sessao.js" data-edge="https://<ref>.supabase.co/functions/v1"
//           data-chave="gss_token_livro"></script>
// O login (auth-form) devolve um token; toda chamada às Edge Functions do
// projeto (fetch ou XMLHttpRequest) sai com ele no header x-gss-sessao — as
// funções tiram dele quem é o colaborador, em vez de confiar no id enviado.
// Resposta 401 de sessão chama GSSSessao.aoExpirar (a página volta ao login).
//   GSSSessao.definir(token) — depois do login
//   GSSSessao.limpar()       — no logout
//   GSSSessao.token()        — token atual ('' sem sessão)
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var tag = document.currentScript;
  var EDGE = (tag && tag.getAttribute('data-edge')) || '';
  var CHAVE = (tag && tag.getAttribute('data-chave')) || 'gss_token';
  var memoria = '';
  var expirando = false;

  function ler() {
    try { return localStorage.getItem(CHAVE) || memoria; } catch (e) { return memoria; }
  }

  function ehDoProjeto(url) {
    return !!EDGE && typeof url === 'string' && url.indexOf(EDGE) === 0;
  }

  function expirou() {
    if (expirando) return;
    expirando = true;
    setTimeout(function() { expirando = false; }, 3000);
    try { if (typeof window.GSSSessao.aoExpirar === 'function') window.GSSSessao.aoExpirar(); } catch (e) {}
  }

  // 401 com codigo SESSAO = token ausente/vencido/de outro sistema.
  function conferir(status, texto) {
    if (status !== 401) return;
    try { if (JSON.parse(texto).codigo === 'SESSAO') expirou(); } catch (e) {}
  }

  window.GSSSessao = {
    token: ler,
    definir: function(t) {
      memoria = t || '';
      try { if (t) localStorage.setItem(CHAVE, t); else localStorage.removeItem(CHAVE); } catch (e) {}
    },
    limpar: function() { window.GSSSessao.definir(''); },
    aoExpirar: null
  };

  // fetch: acrescenta o header e observa o 401.
  var fetchNativo = window.fetch && window.fetch.bind(window);
  if (fetchNativo) {
    window.fetch = function(input, init) {
      if (!ehDoProjeto(input)) return fetchNativo(input, init);
      var t = ler();
      if (t) {
        init = Object.assign({}, init);
        var h = new Headers(init.headers || {});
        h.set('x-gss-sessao', t);
        init.headers = h;
      }
      return fetchNativo(input, init).then(function(resp) {
        if (resp.status === 401) resp.clone().text().then(function(txt) { conferir(401, txt); }).catch(function() {});
        return resp;
      });
    };
  }

  // XMLHttpRequest (o Livro ainda usa chamadas síncronas em alguns pontos).
  var abrir = XMLHttpRequest.prototype.open;
  var enviar = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(metodo, url) {
    this._gssDoProjeto = ehDoProjeto(url);
    return abrir.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    if (this._gssDoProjeto) {
      var t = ler();
      if (t) this.setRequestHeader('x-gss-sessao', t);
      var xhr = this;
      this.addEventListener('loadend', function() { conferir(xhr.status, xhr.responseText); });
    }
    return enviar.apply(this, arguments);
  };
})();
