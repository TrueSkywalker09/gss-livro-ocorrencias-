// ═══════════════════════════════════════════════════════════════════════════════
// GSS — Livro de Ocorrências Eletrônico · Módulo RONDA (ronda.js)
// Ronda por QR code + geolocalização. Mesmo login e mesma escala do Livro,
// mas navegação e código próprios: o colaborador escalado só para ronda nunca
// vê o Livro, e quem faz os dois escolhe no hub "Meus postos".
//
// Depende da ponte window.GSSLivro (index.html): icon, ICONS, escapeHtml,
// showScreen, SUPABASE_EDGE, SUPABASE_ANON_KEY, abrirHub, sair.
// Backend: Edge Function "rondas".
//
// Robustez em campo:
//  - Fila offline (IndexedDB): iniciar/leituras/encerrar feitos sem sinal
//    (subsolo, garagem) ficam na fila e são enviados em ordem quando a rede
//    volta. Cada operação leva id gerado no aparelho → reenvio é idempotente.
//  - O ponto lido é identificado localmente pelo hash do token (o servidor
//    nunca expõe o token), então funciona mesmo offline.
//  - A ronda em andamento sobrevive a recarregar a página ou bloquear a tela.
//  - Trajeto: durante a ronda o GPS é acompanhado (watchPosition), filtrado no
//    aparelho (≥ 8 m ou ≥ 30 s entre pontos) e enviado em lotes de 1 min — ou
//    antes de cada leitura, para o servidor pontuar a chegada ao ponto. Sem
//    rede o lote entra na mesma fila. Wake Lock mantém a tela acesa: com a
//    tela apagada o navegador para de entregar o GPS.
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var L = window.GSSLivro;
  if (!L) return;

  var EXTRA_ICONS = {
    'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
    'camera': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',
    'image': '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',
    'play': '<polygon points="5 3 19 12 5 21 5 3"></polygon>',
    'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line>',
    'wifi-off': '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line>',
    'refresh-cw': '<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',
    'circle': '<circle cx="12" cy="12" r="10"></circle>',
    'crosshair': '<circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line>',
    'maximize': '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>'
  };
  Object.keys(EXTRA_ICONS).forEach(function(k) { if (!L.ICONS[k]) L.ICONS[k] = EXTRA_ICONS[k]; });

  var icon = L.icon;
  var esc = L.escapeHtml;

  var SESSAO_KEY = 'gss_ronda_sessao';
  var CTX_KEY = 'gss_ronda_ctx_';
  var SESSAO_MAX_MS = 14 * 60 * 60 * 1000; // cobre um plantão 12x36 com folga
  var PREFIXO_TOKEN = 'GSSR1-';
  // Arquivo local (jsqr 1.4.0): no app Android a página roda sem internet.
  var JSQR_URL = 'jsQR.min.js';
  var URGENCIAS = [
    ['NAO_URGENTE', 'Não Urgente'], ['POUCO_URGENTE', 'Pouco Urgente'], ['URGENTE', 'Urgente'],
    ['MUITO_URGENTE', 'Muito Urgente'], ['EMERGENCIA', 'Emergência']
  ];

  var st = {
    usuario: null,     // { id, nome, re }
    posto: null,       // { id_posto, nome_posto }
    hub: [],           // postos com ronda (hub)
    ctx: null,         // { config, pontos, ronda, leituras, rondas_hoje }
    erroCtx: null,
    leitura: null,     // leitura em registro (tela do ponto)
    filaTamanho: 0,
    sincronizando: false
  };

  // ─── UTIL ────────────────────────────────────────────────────────────────
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function(x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function sha256(texto) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)).then(function(buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function(x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }

  function hora(iso) {
    return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  }

  function toast(msg, tipo) {
    var t = document.getElementById('rd-toast');
    t.textContent = msg;
    t.className = 'rd-toast' + (tipo ? ' ' + tipo : '');
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(function() { t.style.display = 'none'; }, 3800);
  }

  function base() {
    return { id_acesso: st.usuario.id, id_posto: st.posto.id_posto };
  }

  // Erro sem status = sem rede (fetch rejeitou) → vai para a fila offline.
  function api(action, dados) {
    return fetch(L.SUPABASE_EDGE + '/rondas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + L.SUPABASE_ANON_KEY },
      body: JSON.stringify(Object.assign({ action: action }, dados))
    }).then(function(resp) {
      return resp.json().catch(function() { return {}; }).then(function(body) {
        if (!resp.ok || body.error) {
          var e = new Error(body.error || ('Erro ' + resp.status));
          e.status = resp.status;
          throw e;
        }
        return body;
      });
    });
  }

  function semRede(e) { return !e || !e.status; }

  // ─── FILA OFFLINE (IndexedDB, com fallback em memória) ────────────────────
  var db = null;
  var filaMemoria = [];
  var seqMemoria = 1;

  function abrirDB() {
    if (db !== null) return Promise.resolve(db);
    return new Promise(function(resolve) {
      try {
        var req = indexedDB.open('gss-ronda', 1);
        req.onupgradeneeded = function() { req.result.createObjectStore('fila', { keyPath: 'seq', autoIncrement: true }); };
        req.onsuccess = function() { db = req.result; resolve(db); };
        req.onerror = function() { db = false; resolve(false); };
      } catch (e) { db = false; resolve(false); }
    });
  }

  function filaListar() {
    return abrirDB().then(function(d) {
      if (!d) return filaMemoria.slice();
      return new Promise(function(resolve) {
        var itens = [];
        var cur = d.transaction('fila', 'readonly').objectStore('fila').openCursor();
        cur.onsuccess = function() {
          var c = cur.result;
          if (c) { itens.push(c.value); c.continue(); } else resolve(itens);
        };
        cur.onerror = function() { resolve(itens); };
      });
    });
  }

  function filaAdicionar(op) {
    op.criado = Date.now();
    return abrirDB().then(function(d) {
      if (!d) { op.seq = seqMemoria++; filaMemoria.push(op); return; }
      return new Promise(function(resolve) {
        var tx = d.transaction('fila', 'readwrite');
        tx.objectStore('fila').add(op);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }).then(atualizarSync);
  }

  function filaRemover(seq) {
    return abrirDB().then(function(d) {
      if (!d) { filaMemoria = filaMemoria.filter(function(o) { return o.seq !== seq; }); return; }
      return new Promise(function(resolve) {
        var tx = d.transaction('fila', 'readwrite');
        tx.objectStore('fila').delete(seq);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    });
  }

  var ACAO_DA_OP = { iniciar: 'iniciar', leitura: 'registrar-leitura', encerrar: 'encerrar', trajeto: 'registrar-trajeto' };

  // Envia a fila em ordem (iniciar → leituras → encerrar). Para no primeiro
  // erro de rede/servidor para não inverter a ordem; recusa definitiva (4xx)
  // sai da fila com aviso.
  function processarFila() {
    if (st.sincronizando) return Promise.resolve();
    st.sincronizando = true;
    return filaListar().then(function(ops) {
      ops.sort(function(a, b) { return a.seq - b.seq; });
      var cadeia = Promise.resolve(true);
      ops.forEach(function(op) {
        cadeia = cadeia.then(function(continuar) {
          if (!continuar) return false;
          var corpo = Object.assign({ id_acesso: op.id_acesso, id_posto: op.id_posto }, op.dados);
          return api(ACAO_DA_OP[op.tipo], corpo).then(function() {
            return filaRemover(op.seq).then(function() { marcarEnviado(op); return true; });
          }).catch(function(e) {
            if (semRede(e) || e.status >= 500) return false;
            return filaRemover(op.seq).then(function() {
              if (op.tipo === 'trajeto') return true; // lote recusado não merece alarme ao vigilante
              toast((op.tipo === 'leitura' ? 'Leitura de "' + (op.rotulo || 'ponto') + '"' : 'Operação da ronda') + ' recusada: ' + e.message, 'erro');
              return true;
            });
          });
        });
      });
      return cadeia;
    }).then(function() {
      st.sincronizando = false;
      return atualizarSync();
    }, function() {
      st.sincronizando = false;
      return atualizarSync();
    });
  }

  function marcarEnviado(op) {
    if (!st.ctx) return;
    if (op.tipo === 'iniciar' && st.ctx.ronda && st.ctx.ronda.id === op.dados.id) delete st.ctx.ronda._pendente;
    if (op.tipo === 'leitura') {
      st.ctx.leituras.forEach(function(l) { if (l.id === op.dados.id) delete l._pendente; });
    }
    salvarCtxCache();
    rerender();
  }

  function atualizarSync() {
    return filaListar().then(function(ops) {
      st.filaTamanho = ops.length;
      var badges = document.querySelectorAll('.rd-sync');
      var online = navigator.onLine !== false;
      var cls, txt;
      if (!online) { cls = 'offline'; txt = icon('wifi-off', 11) + (ops.length ? ops.length + ' na fila' : 'Sem sinal'); }
      else if (ops.length) { cls = 'pendente'; txt = icon('refresh-cw', 11) + ops.length + ' enviando'; }
      else { cls = 'ok'; txt = icon('check', 11) + 'Sincronizado'; }
      badges.forEach(function(b) { b.className = 'rd-sync ' + cls; b.innerHTML = txt; });
    });
  }

  window.addEventListener('online', function() { processarFila(); });
  window.addEventListener('offline', atualizarSync);
  setInterval(function() { if (st.filaTamanho > 0) processarFila(); }, 20000);

  // ─── TRAJETO (GPS contínuo durante a ronda) ──────────────────────────────
  var TRJ_KEY = 'gss_ronda_trj_';
  var TRJ_PRECISAO_MAX = 100;   // m — pior que isso não serve nem de rastro
  var TRJ_MIN_DIST = 8;         // m
  var TRJ_MIN_INTERVALO = 30;   // s
  var TRJ_LOTE_MS = 60000;
  var TRJ_SEM_SINAL_MS = 45000;
  var trj = { idRonda: null, watchId: null, nativo: false, timer: null, buffer: [], ultimo: null, ultimaFixEm: 0, erro: null, wakeLock: null };

  function distM(lat1, lng1, lat2, lng2) {
    var rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371000 * Math.asin(Math.sqrt(a));
  }

  function salvarBufferTrajeto() {
    if (!trj.idRonda) return;
    try { localStorage.setItem(TRJ_KEY + trj.idRonda, JSON.stringify(trj.buffer)); } catch (e) {}
  }

  function aoPosicionar(pos) {
    var c = pos.coords;
    trj.ultimaFixEm = Date.now();
    trj.erro = null;
    if (c.accuracy > TRJ_PRECISAO_MAX) { atualizarIndicadorTrajeto(); return; }
    var t = Math.round(pos.timestamp / 1000);
    var u = trj.ultimo;
    if (u && t - u[0] < TRJ_MIN_INTERVALO && distM(u[1], u[2], c.latitude, c.longitude) < TRJ_MIN_DIST) {
      atualizarIndicadorTrajeto();
      return;
    }
    var p = [t, Math.round(c.latitude * 1e6) / 1e6, Math.round(c.longitude * 1e6) / 1e6, Math.round(c.accuracy),
      c.altitude == null ? null : Math.round(c.altitude * 10) / 10];
    if (pos.simulado) p.push(1); // app de "GPS falso" (só o app Android detecta)
    trj.ultimo = p;
    trj.buffer.push(p);
    salvarBufferTrajeto();
    atualizarIndicadorTrajeto();
    // Com a tela apagada o setInterval pode dormir; a própria posição dispara o lote.
    if (trj.nativo && trj.buffer.length && t - trj.buffer[0][0] >= TRJ_LOTE_MS / 1000) descarregarTrajeto();
  }

  function aoFalharPosicao(e) {
    trj.erro = e && e.code === 1 ? 'negado' : 'falha';
    atualizarIndicadorTrajeto();
  }

  function pedirWakeLock() {
    if (!trj.idRonda || trj.wakeLock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function(w) {
      trj.wakeLock = w;
      w.addEventListener('release', function() { trj.wakeLock = null; });
    }).catch(function() {});
  }

  // App Android: sem liberar a economia de bateria, marcas como Xiaomi/Samsung
  // matam o GPS com a tela apagada. Confere uma vez por ronda.
  function verificarAparelho() {
    var N = window.GSSNativo;
    if (!N || !N.ativo) return;
    N.status().then(function(s) {
      if (!s.gpsLigado) { toast('Ligue a Localização (GPS) do celular para registrar o trajeto.', 'erro'); return; }
      if (!s.bateriaLiberada && window.confirm('Para o trajeto continuar com a tela apagada, o GSS Legion precisa ficar fora da economia de bateria.\n\nAbrir o ajuste agora?')) {
        N.abrirAjustesBateria();
      }
    }).catch(function() {});
  }

  // Liga o rastreio da ronda em andamento (idempotente — chamado a cada render).
  function garantirRastreio() {
    var ronda = st.ctx && st.ctx.ronda;
    if (!ronda) { pararRastreio(); return; }
    if (trj.idRonda === ronda.id) return;
    if (trj.idRonda) pararRastreio();
    trj.idRonda = ronda.id;
    try { trj.buffer = JSON.parse(localStorage.getItem(TRJ_KEY + ronda.id)) || []; } catch (e) { trj.buffer = []; }
    trj.ultimo = trj.buffer.length ? trj.buffer[trj.buffer.length - 1] : null;
    trj.erro = null;
    trj.nativo = !!(window.GSSNativo && window.GSSNativo.ativo);
    if (trj.nativo) {
      // App Android: GPS segue com a tela apagada (notificação "Ronda em andamento").
      trj.watchId = window.GSSNativo.gpsIniciar(aoPosicionar, aoFalharPosicao);
    } else if (navigator.geolocation) {
      trj.watchId = navigator.geolocation.watchPosition(aoPosicionar, aoFalharPosicao,
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    } else {
      trj.erro = 'falha';
    }
    trj.timer = setInterval(function() { descarregarTrajeto(); atualizarIndicadorTrajeto(); }, TRJ_LOTE_MS);
    pedirWakeLock();
    verificarAparelho();
  }

  // Para o GPS e manda o que sobrou no buffer (que fica salvo se não der).
  function pararRastreio() {
    if (!trj.idRonda) return Promise.resolve();
    if (trj.watchId !== null) {
      if (trj.nativo) window.GSSNativo.gpsParar(trj.watchId);
      else if (navigator.geolocation) navigator.geolocation.clearWatch(trj.watchId);
    }
    clearInterval(trj.timer);
    if (trj.wakeLock) { trj.wakeLock.release().catch(function() {}); trj.wakeLock = null; }
    var fim = descarregarTrajeto();
    trj.idRonda = null; trj.watchId = null; trj.timer = null; trj.ultimo = null; trj.ultimaFixEm = 0;
    return fim;
  }

  // Envia o buffer como um lote. Com fila não-vazia (ou ronda ainda não
  // enviada) vai para a fila, atrás do "iniciar". Nunca rejeita.
  function descarregarTrajeto() {
    if (!trj.idRonda || !trj.buffer.length || !st.usuario || !st.posto) return Promise.resolve();
    var op = {
      tipo: 'trajeto', id_acesso: st.usuario.id, id_posto: st.posto.id_posto,
      dados: { id: uuid(), id_ronda: trj.idRonda, pontos: trj.buffer }
    };
    var pendente = !!(st.ctx && st.ctx.ronda && st.ctx.ronda._pendente);
    trj.buffer = [];
    try { localStorage.removeItem(TRJ_KEY + op.dados.id_ronda); } catch (e) {}
    var enfileirar = function() { return filaAdicionar(op); };
    return filaListar().then(function(ops) {
      if (ops.length || pendente) return enfileirar();
      return api('registrar-trajeto', Object.assign({ id_acesso: op.id_acesso, id_posto: op.id_posto }, op.dados))
        .catch(function(e) { if (semRede(e) || e.status >= 500) return enfileirar(); });
    }).catch(function() {});
  }

  function atualizarIndicadorTrajeto() {
    var el = document.getElementById('rd-trj');
    if (!el) return;
    var cls, txt;
    if (trj.erro === 'negado') { cls = 'falha'; txt = 'Localização bloqueada — permita o acesso ao GPS no navegador'; }
    else if (!trj.ultimaFixEm || Date.now() - trj.ultimaFixEm > TRJ_SEM_SINAL_MS) { cls = 'falha'; txt = 'Trajeto: aguardando sinal de GPS'; }
    else { cls = 'ok'; txt = 'Trajeto sendo registrado'; }
    el.className = 'rd-gps rd-trj ' + cls;
    el.innerHTML = icon(cls === 'ok' ? 'crosshair' : 'alert-triangle', 13) + txt;
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') pedirWakeLock();
    else descarregarTrajeto(); // o navegador pode encerrar a página em segundo plano
  });

  // ─── SESSÃO / CACHE ──────────────────────────────────────────────────────
  function salvarSessao() {
    try { localStorage.setItem(SESSAO_KEY, JSON.stringify({ usuario: st.usuario, posto: st.posto, hub: st.hub, ts: Date.now() })); } catch (e) {}
  }

  function chaveCtx() { return CTX_KEY + st.usuario.id + '_' + st.posto.id_posto; }

  function salvarCtxCache() {
    if (!st.ctx || !st.usuario || !st.posto) return;
    try { localStorage.setItem(chaveCtx(), JSON.stringify(st.ctx)); } catch (e) {}
  }

  function lerCtxCache() {
    try { return JSON.parse(localStorage.getItem(chaveCtx())); } catch (e) { return null; }
  }

  // Aplica sobre o contexto do servidor o que ainda está na fila deste posto.
  function mesclarFila(ctx) {
    return filaListar().then(function(ops) {
      ops.filter(function(o) { return o.id_acesso === st.usuario.id && o.id_posto === st.posto.id_posto; })
        .sort(function(a, b) { return a.seq - b.seq; })
        .forEach(function(o) {
          if (o.tipo === 'iniciar' && !ctx.ronda) ctx.ronda = o.ronda;
          if (o.tipo === 'leitura' && ctx.ronda && o.dados.id_ronda === ctx.ronda.id &&
              !ctx.leituras.some(function(l) { return l.id === o.dados.id; })) {
            ctx.leituras.push({ id: o.dados.id, id_ponto: o.id_ponto, lida_em: o.dados.lida_em, status: o.dados.status, _pendente: true });
          }
          if (o.tipo === 'encerrar' && ctx.ronda && o.dados.id_ronda === ctx.ronda.id) {
            ctx.ronda = null;
            ctx.leituras = [];
          }
        });
      return ctx;
    });
  }

  // ─── TELAS (injetadas; o index.html só carrega este arquivo) ─────────────
  function topo(id, voltar) {
    return '<div class="rd-topo"><div class="rd-topo-linha">' +
      '<button class="rd-topo-voltar" onclick="' + voltar + '" aria-label="Voltar">' + icon('arrow-left', 18) + '</button>' +
      '<div class="rd-topo-info">' +
        '<div class="rd-topo-marca">' + icon('shield', 12) + 'Ronda</div>' +
        '<div class="rd-topo-titulo" id="' + id + '-titulo"></div>' +
        '<div class="rd-topo-sub" id="' + id + '-sub"></div>' +
      '</div>' +
      '<span class="rd-sync ok"></span>' +
    '</div></div>';
  }

  function injetarTelas() {
    var html =
      '<div class="screen rd-screen" id="ronda-inicio-screen">' + topo('rd-inicio', 'GSSRonda.voltarHub()') +
        '<div class="rd-corpo" id="rd-inicio-corpo"></div></div>' +
      '<div class="screen rd-screen" id="ronda-exec-screen">' + topo('rd-exec', 'GSSRonda.voltarHub()') +
        '<div class="rd-corpo" id="rd-exec-corpo"></div></div>' +
      '<div class="screen rd-screen" id="ronda-registro-screen">' + topo('rd-reg', 'GSSRonda.cancelarRegistro()') +
        '<div class="rd-corpo">' +
          '<div class="rd-card"><div class="rd-ponto-lido"><div class="ico">' + icon('check-circle', 40) + '</div>' +
            '<h2 id="rd-reg-ponto"></h2><p id="rd-reg-local"></p></div></div>' +
          '<div class="rd-card">' +
            '<div class="rd-card-titulo">Situação do ponto</div>' +
            '<div class="rd-escolha">' +
              '<button id="rd-op-ok" onclick="GSSRonda.escolherStatus(\'ok\')">' + icon('check-circle', 22) + 'Sem alteração</button>' +
              '<button id="rd-op-anomalia" onclick="GSSRonda.escolherStatus(\'anomalia\')">' + icon('alert-triangle', 22) + 'Anormalidade</button>' +
            '</div>' +
            '<div id="rd-anomalia-campos" style="display:none">' +
              '<div class="form-field"><label>' + icon('alert-triangle', 13) + ' Urgência <span class="required">*</span></label>' +
                '<select id="rd-urgencia">' + URGENCIAS.map(function(u) { return '<option value="' + u[0] + '">' + u[1] + '</option>'; }).join('') + '</select></div>' +
              '<div class="form-field"><label>' + icon('file-text', 13) + ' O que foi encontrado <span class="required">*</span></label>' +
                '<textarea id="rd-obs" placeholder="Descreva a anormalidade…" style="min-height:100px"></textarea></div>' +
              '<div class="form-field"><label>' + icon('camera', 13) + ' Foto <span id="rd-foto-obrig"></span></label>' +
                '<div class="rd-fotos">' +
                  '<button type="button" class="btn btn-primary icon-inline" onclick="document.getElementById(\'rd-foto-camera\').click()">' + icon('camera', 15) + 'Tirar foto</button>' +
                  '<button type="button" class="btn btn-outline icon-inline" onclick="document.getElementById(\'rd-foto-galeria\').click()">' + icon('image', 15) + 'Galeria</button>' +
                '</div>' +
                '<input type="file" accept="image/*" capture="environment" id="rd-foto-camera" style="display:none">' +
                '<input type="file" accept="image/*" id="rd-foto-galeria" style="display:none">' +
                '<img id="rd-foto-preview" class="rd-preview" alt="Prévia da foto"></div>' +
              '<div style="font-size:11.5px;color:var(--text2);margin:-6px 0 12px">A anormalidade é lançada automaticamente como ocorrência no Livro do posto.</div>' +
            '</div>' +
            '<div class="rd-gps" id="rd-gps"></div>' +
            '<div class="rd-acoes">' +
              '<button class="btn btn-success icon-inline" id="rd-btn-confirmar" onclick="GSSRonda.confirmarRegistro()">' + icon('check-circle', 16) + '<span>Confirmar ponto</span></button>' +
              '<button class="btn btn-outline" onclick="GSSRonda.cancelarRegistro()">Cancelar</button>' +
            '</div>' +
          '</div>' +
        '</div></div>' +
      '<div class="rd-scanner" id="rd-scanner">' +
        '<video id="rd-video" playsinline autoplay muted></video>' +
        '<canvas id="rd-canvas" style="display:none"></canvas>' +
        '<div class="rd-scanner-mira"><div></div></div>' +
        '<div class="rd-scanner-rodape"><p id="rd-scanner-msg">Aponte a câmera para o QR code do ponto</p>' +
          '<button class="btn" onclick="GSSRonda.fecharScanner()">Cancelar</button></div>' +
      '</div>' +
      '<div class="rd-toast" id="rd-toast"></div>';
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('rd-foto-camera').addEventListener('change', function(e) { processarFoto(e.target.files[0]); });
    document.getElementById('rd-foto-galeria').addEventListener('change', function(e) { processarFoto(e.target.files[0]); });
  }

  function preencherTopo(prefixo, titulo, sub) {
    document.getElementById(prefixo + '-titulo').textContent = titulo;
    document.getElementById(prefixo + '-sub').textContent = sub;
  }

  function telaAtiva() {
    var el = document.querySelector('.screen.active');
    return el ? el.id : '';
  }

  function rerender() {
    var tela = telaAtiva();
    if (tela === 'ronda-inicio-screen') renderInicio();
    if (tela === 'ronda-exec-screen') renderExec();
  }

  // ─── HUB (cards na tela de livros) ───────────────────────────────────────
  function renderHub(usuario, rondas) {
    st.usuario = { id: usuario.id, nome: usuario.nome, re: usuario.re };
    st.hub = rondas || [];
    if (!st.hub.length) return '';
    return '<div class="rd-hub-titulo">' + icon('shield', 14) + 'Ronda</div>' +
      '<div class="rd-hub-grid">' + st.hub.map(function(r, i) {
        return '<div class="rd-hub-card" onclick="GSSRonda.abrirPorIndice(' + i + ')">' +
          '<div class="ico-box">' + icon('shield', 22) + '</div>' +
          '<div style="min-width:0"><h3>' + esc(r.nome_posto) + '</h3>' +
            '<div class="cc">CC ' + esc(r.id_posto) + '</div>' +
            '<div class="abrir">Abrir Ronda →</div></div>' +
        '</div>';
      }).join('') + '</div>';
  }

  // ─── ABRIR POSTO ─────────────────────────────────────────────────────────
  function abrir(posto) {
    st.posto = { id_posto: posto.id_posto, nome_posto: posto.nome_posto };
    st.ctx = null;
    st.erroCtx = null;
    salvarSessao();
    L.showScreen('ronda-inicio-screen');
    renderInicio();
    atualizarSync();
    return carregarContexto().then(function() {
      if (st.ctx && st.ctx.ronda) { L.showScreen('ronda-exec-screen'); renderExec(); }
      else renderInicio();
      processarFila();
    });
  }

  function carregarContexto() {
    return api('contexto', base()).then(function(res) {
      st.erroCtx = null;
      return mesclarFila({
        config: res.config, pontos: res.pontos || [], ronda: res.ronda,
        leituras: res.leituras || [], rondas_hoje: res.rondas_hoje || []
      });
    }).then(function(ctx) {
      st.ctx = ctx;
      salvarCtxCache();
    }).catch(function(e) {
      if (semRede(e)) {
        var cache = lerCtxCache();
        if (cache) return mesclarFila(cache).then(function(ctx) { st.ctx = ctx; st.erroCtx = null; });
        st.erroCtx = 'Sem conexão e sem dados salvos deste posto. Conecte-se à internet para carregar os pontos da ronda.';
      } else {
        st.erroCtx = e.message;
      }
    });
  }

  function lidasPorPonto() {
    var mapa = {};
    ((st.ctx && st.ctx.leituras) || []).forEach(function(l) { mapa[l.id_ponto] = l; });
    return mapa;
  }

  // ─── TELA INÍCIO ─────────────────────────────────────────────────────────
  function renderInicio() {
    if (st.ctx) garantirRastreio();
    preencherTopo('rd-inicio', st.posto.nome_posto, 'CC ' + st.posto.id_posto + ' · ' + (st.usuario.nome || ''));
    var corpo = document.getElementById('rd-inicio-corpo');
    atualizarSync();

    if (st.erroCtx) {
      corpo.innerHTML = '<div class="rd-card"><div class="rd-vazio"><div class="ico">' + icon('alert-triangle', 36) + '</div>' +
        esc(st.erroCtx) + '</div>' +
        '<button class="btn btn-primary icon-inline" onclick="GSSRonda.recarregar()">' + icon('refresh-cw', 15) + '<span>Tentar novamente</span></button></div>' +
        botoesRodape();
      return;
    }
    if (!st.ctx) {
      corpo.innerHTML = '<div class="rd-card"><div class="rd-vazio"><div class="spinner"></div>Carregando pontos da ronda…</div></div>';
      return;
    }

    var n = st.ctx.pontos.length;
    var html = '';
    if (!n) {
      html += '<div class="rd-card"><div class="rd-vazio"><div class="ico">' + icon('map-pin', 36) + '</div>' +
        'Nenhum ponto de ronda cadastrado neste posto.<br>Avise a coordenação.</div></div>';
    } else if (st.ctx.ronda) {
      html += '<button class="rd-btn-grande" onclick="GSSRonda.irParaExecucao()">' + icon('play', 26) +
        'Continuar Ronda<small>iniciada às ' + hora(st.ctx.ronda.iniciada_em) + '</small></button>';
    } else {
      html += '<button class="rd-btn-grande" id="rd-btn-iniciar" onclick="GSSRonda.iniciar()">' + icon('play', 26) +
        'Iniciar Ronda<small>' + n + ' ponto' + (n > 1 ? 's' : '') + ' a percorrer</small></button>';
    }

    var hoje = st.ctx.rondas_hoje || [];
    html += '<div class="rd-card"><div class="rd-card-titulo">Suas rondas hoje</div>';
    if (!hoje.length) {
      html += '<div style="font-size:13px;color:var(--text2)">Nenhuma ronda registrada hoje.</div>';
    } else {
      var rotulos = { concluida: 'Concluída', interrompida: 'Interrompida', em_andamento: 'Em andamento' };
      html += hoje.map(function(r) {
        return '<div class="rd-hist-item"><span class="hora">' + hora(r.iniciada_em) + (r.encerrada_em ? ' – ' + hora(r.encerrada_em) : '') + '</span>' +
          '<span style="color:var(--text2)">' + r.total_pontos + ' pontos</span>' +
          '<span class="res ' + r.status + '">' + rotulos[r.status] + '</span></div>';
      }).join('');
    }
    html += '</div>';

    if (st.filaTamanho) {
      html += '<div class="rd-card" style="background:var(--warning-bg);border:1px solid var(--warning-border);font-size:13px;color:#92400e">' +
        icon('wifi-off', 14) + ' ' + st.filaTamanho + ' registro(s) aguardando conexão. Serão enviados automaticamente.</div>';
    }

    corpo.innerHTML = html + botoesRodape();
  }

  function botoesRodape() {
    return '<div class="rd-acoes" style="margin-top:6px">' +
      '<button class="btn btn-outline icon-inline" onclick="GSSRonda.voltarHub()">' + icon('arrow-left', 15) + '<span>Meus postos</span></button>' +
      '<button class="btn btn-outline icon-inline" onclick="GSSRonda.sair()" style="color:var(--danger)">' + icon('log-out', 15) + '<span>Sair</span></button>' +
    '</div>';
  }

  // ─── INICIAR ─────────────────────────────────────────────────────────────
  function iniciar() {
    var btn = document.getElementById('rd-btn-iniciar');
    if (btn) btn.disabled = true;
    var id = uuid();
    var agora = new Date().toISOString();
    var rondaLocal = { id: id, iniciada_em: agora, status: 'em_andamento', total_pontos: st.ctx.pontos.length };

    var enfileirar = function() {
      rondaLocal._pendente = true;
      return filaAdicionar({ tipo: 'iniciar', id_acesso: st.usuario.id, id_posto: st.posto.id_posto, dados: { id: id }, ronda: rondaLocal })
        .then(function() {
          toast('Sem sinal — a ronda começou e será enviada quando a conexão voltar.');
          return rondaLocal;
        });
    };

    filaListar().then(function(ops) {
      if (ops.length) return enfileirar();
      return api('iniciar', Object.assign(base(), { id: id })).then(function(res) {
        return res.ronda;
      }, function(e) {
        if (semRede(e)) return enfileirar();
        throw e;
      });
    }).then(function(ronda) {
      st.ctx.ronda = ronda;
      st.ctx.leituras = ronda.id === id ? [] : st.ctx.leituras;
      salvarCtxCache();
      L.showScreen('ronda-exec-screen');
      renderExec();
      if (ronda.id !== id) carregarContexto().then(renderExec); // retomou uma ronda aberta em outro aparelho
    }).catch(function(e) {
      if (btn) btn.disabled = false;
      toast(e.message, 'erro');
    });
  }

  // ─── TELA EXECUÇÃO ───────────────────────────────────────────────────────
  function renderExec() {
    if (!st.ctx || !st.ctx.ronda) { L.showScreen('ronda-inicio-screen'); renderInicio(); return; }
    garantirRastreio();
    preencherTopo('rd-exec', st.posto.nome_posto, 'Ronda em andamento · ' + (st.usuario.nome || ''));
    atualizarSync();
    var mapa = lidasPorPonto();
    var pontos = st.ctx.pontos;
    var lidos = pontos.filter(function(p) { return mapa[p.id]; }).length;
    var total = pontos.length;
    var pct = total ? Math.round(lidos / total * 100) : 0;
    var completo = total && lidos >= total;

    var grade = pontos.map(function(p) {
      var l = mapa[p.id];
      var cls = !l ? '' : l.status === 'anomalia' ? 'anomalia' : 'feito';
      if (l && l._pendente) cls += ' pendente-envio';
      var ic = !l ? 'circle' : l.status === 'anomalia' ? 'alert-triangle' : 'check-circle';
      return '<div class="rd-ponto ' + cls + '"><span class="ico">' + icon(ic, 15) + '</span><span>' + esc(p.nome) +
        (l ? '<small>' + hora(l.lida_em) + (l._pendente ? ' · na fila' : '') + '</small>' : '') + '</span></div>';
    }).join('');

    document.getElementById('rd-exec-corpo').innerHTML =
      '<div class="rd-card">' +
        '<div class="rd-progresso"><div class="rd-progresso-num">' + lidos + ' <small>de ' + total + ' pontos</small></div>' +
          '<div class="rd-progresso-hora">desde ' + hora(st.ctx.ronda.iniciada_em) + '</div></div>' +
        '<div class="rd-barra"><div class="rd-barra-fill" style="width:' + pct + '%"></div></div>' +
      '</div>' +
      (completo
        ? '<div class="rd-card" style="background:var(--success-bg);border:1px solid var(--success-border);color:var(--success);font-size:13.5px;font-weight:700;text-align:center">' +
            icon('check-circle', 16) + ' Todos os pontos lidos. Encerre a ronda.</div>'
        : '<button class="rd-btn-grande" onclick="GSSRonda.abrirScanner()">' + icon('maximize', 28) + 'Escanear QR do Ponto<small>aponte a câmera para a etiqueta</small></button>') +
      '<div class="rd-gps rd-trj" id="rd-trj"></div>' +
      '<div class="rd-card"><div class="rd-card-titulo">Pontos</div><div class="rd-pontos">' + grade + '</div></div>' +
      '<button class="btn ' + (completo ? 'btn-success' : 'btn-outline') + ' icon-inline" onclick="GSSRonda.encerrar()">' + icon('flag', 15) + '<span>Encerrar Ronda</span></button>';
    atualizarIndicadorTrajeto();
  }

  // ─── SCANNER ─────────────────────────────────────────────────────────────
  var scan = { stream: null, detector: null, raf: null, ocupado: false, ultimoAviso: '', ultimoAvisoEm: 0 };

  function carregarJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = JSQR_URL;
      s.onload = resolve;
      s.onerror = function() { reject(new Error('Não foi possível carregar o leitor de QR. Recarregue a página.')); };
      document.head.appendChild(s);
    });
  }

  function prepararDetector() {
    if (scan.detector !== null) return Promise.resolve();
    if ('BarcodeDetector' in window) {
      return window.BarcodeDetector.getSupportedFormats().then(function(f) {
        if (f.indexOf('qr_code') >= 0) { scan.detector = new window.BarcodeDetector({ formats: ['qr_code'] }); return; }
        scan.detector = false;
        return carregarJsQR();
      }).catch(function() { scan.detector = false; return carregarJsQR(); });
    }
    scan.detector = false;
    return carregarJsQR();
  }

  function msgScanner(texto, erro) {
    var p = document.getElementById('rd-scanner-msg');
    p.textContent = texto;
    p.className = erro ? 'erro' : '';
  }

  function abrirScanner() {
    document.getElementById('rd-scanner').classList.add('aberto');
    msgScanner('Aponte a câmera para o QR code do ponto');
    prepararDetector().then(function() {
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    }).then(function(stream) {
      scan.stream = stream;
      var video = document.getElementById('rd-video');
      video.srcObject = stream;
      return video.play();
    }).then(function() {
      loopScanner();
    }).catch(function(e) {
      fecharScanner();
      toast(e && e.name === 'NotAllowedError'
        ? 'Permita o acesso à câmera no navegador para ler o QR.'
        : (e && e.message) || 'Não foi possível abrir a câmera.', 'erro');
    });
  }

  function fecharScanner() {
    document.getElementById('rd-scanner').classList.remove('aberto');
    if (scan.raf) cancelAnimationFrame(scan.raf);
    scan.raf = null;
    if (scan.stream) { scan.stream.getTracks().forEach(function(t) { t.stop(); }); scan.stream = null; }
    scan.ocupado = false;
  }

  function loopScanner() {
    var video = document.getElementById('rd-video');
    var canvas = document.getElementById('rd-canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });

    function tick() {
      if (!scan.stream) return;
      if (!scan.ocupado && video.readyState === video.HAVE_ENOUGH_DATA) {
        scan.ocupado = true;
        detectar(video, canvas, ctx).then(function(texto) {
          scan.ocupado = false;
          if (texto && scan.stream) return avaliarCodigo(texto);
        }).catch(function() { scan.ocupado = false; });
      }
      scan.raf = requestAnimationFrame(tick);
    }
    scan.raf = requestAnimationFrame(tick);
  }

  function detectar(video, canvas, ctx) {
    if (scan.detector) {
      return scan.detector.detect(video).then(function(cods) { return cods.length ? cods[0].rawValue : null; });
    }
    // jsQR: reduz o quadro para ~640px — decodificar em resolução cheia trava celular simples.
    var escala = Math.min(1, 640 / (video.videoWidth || 640));
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    return Promise.resolve(r ? r.data : null);
  }

  // Avisa sem fechar a câmera, sem repetir o mesmo aviso a cada quadro.
  function avisoScanner(texto) {
    var agora = Date.now();
    if (texto === scan.ultimoAviso && agora - scan.ultimoAvisoEm < 2500) return;
    scan.ultimoAviso = texto;
    scan.ultimoAvisoEm = agora;
    msgScanner(texto, true);
    if (navigator.vibrate) navigator.vibrate([60, 60, 60]);
  }

  function avaliarCodigo(texto) {
    texto = String(texto).trim();
    if (texto.indexOf(PREFIXO_TOKEN) !== 0) { avisoScanner('Este QR não é um ponto de ronda GSS.'); return; }
    return sha256(texto).then(function(hash) {
      if (!scan.stream) return;
      var ponto = st.ctx.pontos.find(function(p) { return p.hash === hash; });
      if (!ponto) { avisoScanner('Este QR não pertence a este posto.'); return; }
      if (lidasPorPonto()[ponto.id]) { avisoScanner('"' + ponto.nome + '" já foi registrado nesta ronda.'); return; }
      if (navigator.vibrate) navigator.vibrate(120);
      fecharScanner();
      abrirRegistro(ponto, texto);
    });
  }

  // ─── REGISTRO DO PONTO ───────────────────────────────────────────────────
  function obterLocalizacao() {
    return new Promise(function(resolve) {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        function(pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisao_m: pos.coords.accuracy, altitude_m: pos.coords.altitude }); },
        function() { resolve(null); },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
      );
    });
  }

  function atualizarGps() {
    var el = document.getElementById('rd-gps');
    var l = st.leitura;
    if (!l) return;
    if (l.gps === undefined) { el.className = 'rd-gps'; el.innerHTML = icon('crosshair', 14) + 'Obtendo localização…'; return; }
    if (l.gps === null) { el.className = 'rd-gps falha'; el.innerHTML = icon('alert-triangle', 14) + 'Localização indisponível — o ponto será registrado sem GPS.'; return; }
    el.className = 'rd-gps ok';
    el.innerHTML = icon('map-pin', 14) + 'Localização capturada (±' + Math.round(l.gps.precisao_m) + ' m)';
  }

  // Só no app Android, no instante da leitura do QR, sem depender de internet:
  // redes Wi-Fi à vista (conferência do local), barômetro (andar) e hora pelo
  // GPS (relógio do aparelho pode ter sido alterado). Cada item chega quando
  // fica pronto; o que não chegar até o "Confirmar" vai sem.
  function coletarExtrasNativos(leitura) {
    leitura.extras = {};
    var N = window.GSSNativo;
    if (!N || !N.ativo) return;
    leitura.extras.origem = 'app';
    N.horaGps().then(function(h) { if (h && h.epoch_ms) leitura.extras.gps_time_ms = h.epoch_ms; }).catch(function() {});
    N.pressao().then(function(p) { if (p && p.hpa != null) leitura.extras.pressao_hpa = p.hpa; }).catch(function() {});
    N.wifiScan().then(function(w) {
      leitura.extras.wifi = ((w && w.redes) || [])
        .sort(function(a, b) { return b.rssi - a.rssi; })
        .slice(0, 15)
        .map(function(r) { return { bssid: r.bssid, ssid: r.ssid, rssi: r.rssi, idade_s: r.idade_s }; });
      leitura.extras.wifi_em_cache = !!(w && w.em_cache);
    }).catch(function() {});
  }

  function abrirRegistro(ponto, token) {
    st.leitura = { ponto: ponto, token: token, lida_em: new Date().toISOString(), status: 'ok', foto: null, processandoFoto: false, gps: undefined };
    var leitura = st.leitura;
    leitura.gpsPromise = obterLocalizacao().then(function(loc) {
      leitura.gps = loc;
      if (st.leitura === leitura) atualizarGps();
      return loc;
    });
    coletarExtrasNativos(leitura);

    preencherTopo('rd-reg', 'Registrar ponto', st.posto.nome_posto + ' · lido às ' + hora(leitura.lida_em));
    document.getElementById('rd-reg-ponto').textContent = ponto.nome;
    document.getElementById('rd-reg-local').textContent = ponto.local_descricao || '';
    document.getElementById('rd-obs').value = '';
    document.getElementById('rd-urgencia').value = 'NAO_URGENTE';
    document.getElementById('rd-foto-camera').value = '';
    document.getElementById('rd-foto-galeria').value = '';
    document.getElementById('rd-foto-preview').style.display = 'none';
    document.getElementById('rd-foto-obrig').innerHTML = st.ctx.config && st.ctx.config.exigir_foto_anomalia ? '<span class="required">*</span>' : '(opcional)';
    var btn = document.getElementById('rd-btn-confirmar');
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Confirmar ponto';
    escolherStatus('ok');
    atualizarGps();
    L.showScreen('ronda-registro-screen');
  }

  function escolherStatus(status) {
    if (!st.leitura) return;
    st.leitura.status = status;
    document.getElementById('rd-op-ok').className = status === 'ok' ? 'sel-ok' : '';
    document.getElementById('rd-op-anomalia').className = status === 'anomalia' ? 'sel-anomalia' : '';
    document.getElementById('rd-anomalia-campos').style.display = status === 'anomalia' ? 'block' : 'none';
    if (status === 'anomalia') setTimeout(function() { document.getElementById('rd-obs').focus(); }, 50);
  }

  function comprimirImagem(arquivo, maxDim, qualidade) {
    return new Promise(function(resolve, reject) {
      var leitor = new FileReader();
      leitor.onload = function() {
        var img = new Image();
        img.onload = function() {
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; } else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', qualidade));
        };
        img.onerror = function() { reject(new Error('falha ao ler imagem')); };
        img.src = leitor.result;
      };
      leitor.onerror = function() { reject(new Error('falha ao ler arquivo')); };
      leitor.readAsDataURL(arquivo);
    });
  }

  function processarFoto(arquivo) {
    if (!st.leitura || !arquivo) return;
    var leitura = st.leitura;
    leitura.processandoFoto = true;
    comprimirImagem(arquivo, 1280, 0.7).then(function(dataUrl) {
      leitura.foto = dataUrl;
      leitura.processandoFoto = false;
      var prev = document.getElementById('rd-foto-preview');
      prev.src = dataUrl;
      prev.style.display = 'block';
    }).catch(function() {
      leitura.processandoFoto = false;
      toast('Não foi possível processar essa foto — tente outra.', 'erro');
    });
  }

  function cancelarRegistro() {
    st.leitura = null;
    L.showScreen('ronda-exec-screen');
    renderExec();
  }

  function confirmarRegistro() {
    var l = st.leitura;
    if (!l) return;
    var obs = document.getElementById('rd-obs').value.trim();
    if (l.status === 'anomalia') {
      if (!obs) { toast('Descreva a anormalidade.', 'erro'); document.getElementById('rd-obs').focus(); return; }
      if (l.processandoFoto) { toast('Aguarde — processando a foto.'); return; }
      if (st.ctx.config && st.ctx.config.exigir_foto_anomalia && !l.foto) { toast('Este posto exige foto na anormalidade.', 'erro'); return; }
    }

    var btn = document.getElementById('rd-btn-confirmar');
    btn.disabled = true;
    btn.querySelector('span').textContent = l.gps === undefined ? 'Obtendo localização…' : 'Salvando…';

    // Espera o GPS no máximo mais 8 s depois do toque — não segura o vigilante.
    var limite = new Promise(function(resolve) { setTimeout(function() { resolve(null); }, 8000); });
    Promise.race([l.gpsPromise, limite]).then(function(loc) {
      btn.querySelector('span').textContent = 'Salvando…';
      var dados = {
        id: uuid(),
        id_ronda: st.ctx.ronda.id,
        token: l.token,
        status: l.status,
        obs: l.status === 'anomalia' ? obs : null,
        urgencia: l.status === 'anomalia' ? document.getElementById('rd-urgencia').value : null,
        foto: l.status === 'anomalia' ? l.foto : null,
        lida_em: l.lida_em,
        lat: loc ? loc.lat : null,
        lng: loc ? loc.lng : null,
        precisao_m: loc ? loc.precisao_m : null,
        altitude_m: loc ? loc.altitude_m : null
      };
      Object.assign(dados, l.extras || {});
      // Trajeto recente chega antes da leitura: o servidor usa para o score.
      return descarregarTrajeto().then(function() { return enviarLeitura(dados, l.ponto); });
    }).then(function(ok) {
      if (!ok) { btn.disabled = false; btn.querySelector('span').textContent = 'Confirmar ponto'; return; }
      st.leitura = null;
      L.showScreen('ronda-exec-screen');
      renderExec();
    });
  }

  // true = registrada (no servidor ou na fila); false = recusada (fica na tela).
  function enviarLeitura(dados, ponto) {
    var registrarLocal = function(pendente, leituraServidor) {
      st.ctx.leituras.push({
        id: dados.id, id_ponto: ponto.id, lida_em: dados.lida_em, status: dados.status,
        dentro_raio: leituraServidor ? leituraServidor.dentro_raio : null, _pendente: pendente || undefined
      });
      salvarCtxCache();
    };
    var enfileirar = function() {
      return filaAdicionar({
        tipo: 'leitura', id_acesso: st.usuario.id, id_posto: st.posto.id_posto,
        id_ponto: ponto.id, rotulo: ponto.nome, dados: dados
      }).then(function() {
        registrarLocal(true);
        toast('"' + ponto.nome + '" salvo no aparelho — será enviado quando a conexão voltar.');
        return true;
      });
    };

    // Com a fila não-vazia a leitura entra atrás dela: a ordem iniciar →
    // leituras → encerrar precisa chegar intacta ao servidor.
    return filaListar().then(function(ops) {
      if (ops.length || st.ctx.ronda._pendente) return enfileirar().then(function(r) { processarFila(); return r; });
      return api('registrar-leitura', Object.assign(base(), dados)).then(function(res) {
        registrarLocal(false, res.leitura);
        if (res.protocolo) toast('Anormalidade lançada no Livro — protocolo ' + res.protocolo, 'ok');
        else toast('"' + ponto.nome + '" registrado.', 'ok');
        if (res.leitura && res.leitura.dentro_raio === false) {
          setTimeout(function() { toast('Atenção: sua localização ficou fora do raio esperado deste posto.'); }, 3900);
        }
        return true;
      }, function(e) {
        if (semRede(e) || e.status >= 500) return enfileirar();
        if (e.status === 409) carregarContexto().then(rerender);
        toast(e.message, 'erro');
        return false;
      });
    });
  }

  // ─── ENCERRAR ────────────────────────────────────────────────────────────
  function encerrar() {
    var mapa = lidasPorPonto();
    var faltam = st.ctx.pontos.filter(function(p) { return !mapa[p.id]; }).length;
    var msg = faltam
      ? 'Ainda faltam ' + faltam + ' ponto(s). Encerrar mesmo assim?\n\nA ronda ficará registrada como INTERROMPIDA.'
      : 'Encerrar a ronda?';
    if (!window.confirm(msg)) return;

    var dados = { id_ronda: st.ctx.ronda.id, encerrada_em: new Date().toISOString(), pendentes_offline: 0 };
    var concluir = function(texto) {
      pararRastreio();
      st.ctx.ronda = null;
      st.ctx.leituras = [];
      salvarCtxCache();
      toast(texto, 'ok');
      L.showScreen('ronda-inicio-screen');
      renderInicio();
      carregarContexto().then(renderInicio);
    };
    var enfileirar = function() {
      return filaAdicionar({ tipo: 'encerrar', id_acesso: st.usuario.id, id_posto: st.posto.id_posto, dados: dados })
        .then(function() { processarFila(); concluir('Ronda encerrada — será sincronizada quando a conexão voltar.'); });
    };

    // Último lote do trajeto vai antes do encerrar (o servidor recalcula os scores).
    descarregarTrajeto().then(filaListar).then(function(ops) {
      if (ops.length || st.ctx.ronda._pendente) return enfileirar();
      return api('encerrar', Object.assign(base(), dados)).then(function(res) {
        concluir(res.ronda && res.ronda.status === 'concluida' ? 'Ronda concluída. Bom trabalho!' : 'Ronda encerrada.');
      }, function(e) {
        if (semRede(e) || e.status >= 500) return enfileirar();
        toast(e.message, 'erro');
      });
    });
  }

  // ─── API PÚBLICA (usada pelo index.html e pelos onclick) ─────────────────
  window.GSSRonda = {
    renderHub: renderHub,
    abrirPorIndice: function(i) { if (st.hub[i]) abrir(st.hub[i]); },
    // Colaborador só de ronda num único posto entra direto, sem hub.
    abrirDireto: function(usuario, posto) {
      st.usuario = { id: usuario.id, nome: usuario.nome, re: usuario.re };
      st.hub = [posto];
      return abrir(posto);
    },
    restaurar: function() {
      try {
        var s = JSON.parse(localStorage.getItem(SESSAO_KEY));
        if (!s || !s.usuario || !s.posto || Date.now() - s.ts > SESSAO_MAX_MS) {
          localStorage.removeItem(SESSAO_KEY);
          return false;
        }
        st.usuario = s.usuario;
        st.hub = s.hub || [s.posto];
        abrir(s.posto);
        return true;
      } catch (e) { return false; }
    },
    limpar: function() {
      pararRastreio();
      try { localStorage.removeItem(SESSAO_KEY); } catch (e) {}
      st.posto = null;
      st.ctx = null;
    },
    voltarHub: function() {
      var usuario = st.usuario;
      window.GSSRonda.limpar();
      L.abrirHub(usuario);
    },
    sair: function() {
      window.GSSRonda.limpar();
      L.sair();
    },
    recarregar: function() {
      st.erroCtx = null;
      st.ctx = null;
      renderInicio();
      carregarContexto().then(function() {
        if (st.ctx && st.ctx.ronda) { L.showScreen('ronda-exec-screen'); renderExec(); } else renderInicio();
      });
    },
    iniciar: iniciar,
    emAndamento: function() { return !!(trj.idRonda || (st.ctx && st.ctx.ronda)); },
    irParaExecucao: function() { L.showScreen('ronda-exec-screen'); renderExec(); },
    abrirScanner: abrirScanner,
    fecharScanner: fecharScanner,
    escolherStatus: escolherStatus,
    confirmarRegistro: confirmarRegistro,
    cancelarRegistro: cancelarRegistro,
    encerrar: encerrar
  };

  injetarTelas();
  // Fila deixada por uma sessão anterior (ex.: aparelho ficou sem sinal e
  // a página foi fechada) — cada operação carrega o próprio id_acesso/posto.
  processarFila();
})();
