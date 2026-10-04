// ═══════════════════════════════════════════════════════════════════════════════
// App GSS — comunicados e documentos do colaborador (app-gss.js)
// Seção no topo do hub (index.html, #app-gss-secao) com os cards Comunicados e
// Meus documentos (selo de não lidos), e as telas de lista/leitura. Tudo pela
// Edge Function app-gss, com a sessão do login único (gss-sessao.js anexa o
// token). Usa a ponte window.GSSLivro (ícones, telas, escapeHtml).
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var L = function() { return window.GSSLivro; };
  var CATEGORIAS = { contracheque: 'Contracheques', informe: 'Informes de rendimentos', aviso: 'Avisos', outros: 'Outros documentos' };
  var SVG = {
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    open: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'
  };
  function ic(n, t) {
    t = t || 16;
    return '<svg class="icon" width="' + t + '" height="' + t + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + SVG[n] + '</svg>';
  }
  var esc = function(s) { return L().escapeHtml(s == null ? '' : String(s)); };
  function quando(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  // No app (Capacitor) o link externo abre no navegador do sistema quando navega na mesma janela;
  // na web, em outra aba para não sair do app.
  var NATIVO = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var ALVO = NATIVO ? '' : ' target="_blank" rel="noopener"';
  function competencia(c) { return c ? c.slice(5) + '/' + c.slice(0, 4) : ''; }

  function api(acao, dados) {
    return fetch(L().SUPABASE_EDGE + '/app-gss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + L().SUPABASE_ANON_KEY },
      body: JSON.stringify(Object.assign({ action: acao }, dados || {}))
    }).then(function(r) {
      return r.json().catch(function() { return {}; }).then(function(b) {
        if (!r.ok || b.error) throw new Error(b.error || ('Erro ' + r.status));
        return b;
      });
    });
  }

  // Tela própria (uma só, o conteúdo troca entre lista e leitura).
  function tela() {
    var el = document.getElementById('app-gss-screen');
    if (!el) {
      el = document.createElement('div');
      el.className = 'screen app-gss-screen';
      el.id = 'app-gss-screen';
      el.innerHTML = '<div class="ag-topo"><button class="ag-voltar" id="ag-voltar">' + ic('back', 18) + '</button><h1 id="ag-titulo"></h1></div><div id="ag-corpo"></div>';
      document.body.appendChild(el);
    }
    return el;
  }
  function mostrar(titulo, html, voltar) {
    tela();
    document.getElementById('ag-titulo').textContent = titulo;
    document.getElementById('ag-corpo').innerHTML = html;
    document.getElementById('ag-voltar').onclick = voltar;
    L().showScreen('app-gss-screen');
  }
  function carregando(titulo, voltar) { mostrar(titulo, '<div class="ag-vazio">Carregando…</div>', voltar); }
  function erro(titulo, msg, voltar) { mostrar(titulo, '<div class="ag-vazio ag-erro">' + esc(msg) + '</div>', voltar); }

  var G = window.GSSApp = {
    dados: null, // último "inicio"

    // Busca comunicados + selos (cache curto: o hub e o "ir direto para a ronda" usam).
    inicio: function(forcar) {
      if (!forcar && G._promessa && Date.now() - G._em < 15000) return G._promessa;
      G._em = Date.now();
      G._promessa = api('inicio').then(function(b) { G.dados = b; return b; }).catch(function(e) { G._promessa = null; throw e; });
      return G._promessa;
    },
    selos: function() {
      return G.inicio().then(function(b) { return b.selos; }).catch(function() { return null; });
    },

    // Seção do hub: cards com selo.
    atualizarHub: function() {
      var el = document.getElementById('app-gss-secao');
      if (!el) return;
      var card = function(acao, icone, titulo, sub, n) {
        return '<div class="livro-item ag-card" onclick="GSSApp.' + acao + '()">' +
          (n ? '<span class="ag-selo">' + n + '</span>' : '') +
          '<div class="livro-item-icon">' + ic(icone, 20) + '</div>' +
          '<div class="livro-item-body"><h3>' + titulo + '</h3><div class="periodo">' + sub + '</div><div class="abrir">Abrir →</div></div></div>';
      };
      var desenhar = function(s) {
        s = s || { comunicados: 0, documentos: 0 };
        el.innerHTML = '<div class="req-secao-titulo">' + ic('bell', 14) + ' App GSS</div>' +
          '<div class="livros-grid" style="margin-top:0">' +
            card('abrirComunicados', 'bell', 'Comunicados', s.comunicados ? s.comunicados + ' novo(s) para você' : 'Avisos da empresa', s.comunicados) +
            card('abrirDocumentos', 'file', 'Meus documentos', s.documentos ? s.documentos + ' novo(s)' : 'Contracheques, informes e avisos', s.documentos) +
          '</div>';
      };
      desenhar(G.dados && G.dados.selos);
      G.inicio(!G._em || Date.now() - G._em > 5000).then(function(b) { desenhar(b.selos); }).catch(function() {});
    },

    voltarHub: function() {
      L().showScreen('livros-screen');
      G.atualizarHub();
    },

    // ─── Comunicados ─────────────────────────────────────────────────────
    abrirComunicados: function() {
      carregando('Comunicados', G.voltarHub);
      G.inicio(true).then(function(b) {
        var lista = b.comunicados || [];
        if (!lista.length) { mostrar('Comunicados', '<div class="ag-vazio">Nenhum comunicado para você agora.</div>', G.voltarHub); return; }
        mostrar('Comunicados', lista.map(function(c) {
          var pend = !c.lido_em ? '<span class="ag-tag ag-novo">Novo</span>' : (c.exige_ciencia && !c.ciente_em ? '<span class="ag-tag ag-pend">Confirmar leitura</span>' : '');
          return '<div class="ag-item' + (pend ? ' ag-item-novo' : '') + '" onclick="GSSApp.lerComunicado(\'' + c.id + '\')">' +
            '<div class="ag-item-tit">' + esc(c.titulo) + ' ' + pend + '</div>' +
            '<div class="ag-item-sub">' + quando(c.publicado_em) + (c.anexo_tipo ? ' · ' + ic('clip', 12) + ' anexo' : '') + '</div>' +
            '<div class="ag-item-prev">' + esc(String(c.texto || '').slice(0, 140)) + (String(c.texto || '').length > 140 ? '…' : '') + '</div></div>';
        }).join(''), G.voltarHub);
      }).catch(function(e) { erro('Comunicados', e.message, G.voltarHub); });
    },

    lerComunicado: function(id) {
      carregando('Comunicado', G.abrirComunicados);
      api('comunicado-abrir', { id: id }).then(function(c) { G._desenharComunicado(c); })
        .catch(function(e) { erro('Comunicado', e.message, G.abrirComunicados); });
    },
    _desenharComunicado: function(c) {
      var anexo = '';
      if (c.anexo_url && c.anexo_tipo === 'imagem') anexo = '<img class="ag-img" src="' + esc(c.anexo_url) + '" alt="' + esc(c.anexo_nome || 'imagem') + '">';
      else if (c.anexo_url) anexo = '<a class="btn btn-outline ag-btn" href="' + esc(c.anexo_url) + '"' + ALVO + '>' + ic('open', 15) + ' Abrir ' + esc(c.anexo_nome || 'PDF') + '</a>';
      var ciencia = !c.exige_ciencia ? ''
        : c.ciente_em ? '<div class="ag-ok">' + ic('check', 16) + ' Você confirmou a leitura em ' + quando(c.ciente_em) + '</div>'
        : '<button class="btn btn-primary ag-btn" onclick="GSSApp.ciente(\'' + c.id + '\', this)">' + ic('check', 16) + ' Li e estou ciente</button>';
      mostrar('Comunicado',
        '<div class="ag-doc"><h2>' + esc(c.titulo) + '</h2>' +
        '<div class="ag-texto">' + esc(c.texto).replace(/\n/g, '<br>') + '</div>' + anexo + ciencia + '</div>', G.abrirComunicados);
    },
    ciente: function(id, btn) {
      btn.disabled = true; btn.textContent = 'Confirmando…';
      api('comunicado-ciente', { id: id }).then(function(c) { G._em = 0; G._desenharComunicado(c); })
        .catch(function(e) { btn.disabled = false; btn.textContent = 'Li e estou ciente'; alert(e.message); });
    },

    // ─── Documentos ──────────────────────────────────────────────────────
    abrirDocumentos: function() {
      carregando('Meus documentos', G.voltarHub);
      api('documentos').then(function(b) {
        var docs = b.documentos || [];
        if (!docs.length) { mostrar('Meus documentos', '<div class="ag-vazio">Você ainda não tem documentos aqui.</div>', G.voltarHub); return; }
        var grupos = {};
        docs.forEach(function(d) { (grupos[d.categoria] = grupos[d.categoria] || []).push(d); });
        mostrar('Meus documentos', Object.keys(CATEGORIAS).filter(function(k) { return grupos[k]; }).map(function(k) {
          return '<div class="req-secao-titulo">' + esc(CATEGORIAS[k]) + '</div>' + grupos[k].map(function(d) {
            var pend = !d.visto_em ? '<span class="ag-tag ag-novo">Novo</span>' : (d.exige_ciencia && !d.ciente_em ? '<span class="ag-tag ag-pend">Confirmar recebimento</span>' : '');
            return '<div class="ag-item' + (pend ? ' ag-item-novo' : '') + '" onclick="GSSApp.abrirDocumento(\'' + d.id + '\')">' +
              '<div class="ag-item-tit">' + ic('file', 14) + ' ' + esc(d.titulo) + ' ' + pend + '</div>' +
              '<div class="ag-item-sub">' + (d.competencia ? 'Referência ' + competencia(d.competencia) + ' · ' : '') + 'enviado em ' + quando(d.publicado_em) + '</div></div>';
          }).join('');
        }).join(''), G.voltarHub);
      }).catch(function(e) { erro('Meus documentos', e.message, G.voltarHub); });
    },

    abrirDocumento: function(id) {
      carregando('Documento', G.abrirDocumentos);
      api('documento-abrir', { id: id }).then(function(d) { G._em = 0; G._desenharDocumento(d); })
        .catch(function(e) { erro('Documento', e.message, G.abrirDocumentos); });
    },
    _desenharDocumento: function(d) {
      if (d.url) G._docUrl = d.url; else d.url = G._docUrl;
      var ciencia = !d.exige_ciencia ? ''
        : d.ciente_em ? '<div class="ag-ok">' + ic('check', 16) + ' Recebimento confirmado em ' + quando(d.ciente_em) + '</div>'
        : '<button class="btn btn-primary ag-btn" onclick="GSSApp.docCiente(\'' + d.id + '\', this)">' + ic('check', 16) + ' Confirmar recebimento</button>';
      mostrar('Documento',
        '<div class="ag-doc"><h2>' + esc(d.titulo) + '</h2>' +
        (d.url ? '<a class="btn btn-outline ag-btn" href="' + esc(d.url) + '"' + ALVO + '>' + ic('open', 15) + ' Abrir o PDF</a>' +
          '<div class="ag-item-sub" style="margin-top:6px">O link vale por 10 minutos — se expirar, volte e abra de novo.</div>' : '') +
        ciencia + '</div>', G.abrirDocumentos);
    },
    docCiente: function(id, btn) {
      btn.disabled = true; btn.textContent = 'Confirmando…';
      api('documento-ciente', { id: id }).then(function(d) { G._em = 0; G._desenharDocumento(d); })
        .catch(function(e) { btn.disabled = false; btn.textContent = 'Confirmar recebimento'; alert(e.message); });
    }
  };
})();
