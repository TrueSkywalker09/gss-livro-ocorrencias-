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
//  - Anormalidade presa ao ponto: ao ler o QR de um ponto com ocorrência de
//    ronda ABERTA, o vigilante informa a situação atual (SEM ALTERAÇÃO /
//    AGRAVOU / FINALIZADO) — vira constatação na mesma ocorrência, não uma
//    ocorrência nova. Lista no cache do contexto (offline) + consulta fresca.
//  - Alarmes (app Android 1.0.3+): o celular fica fixo no posto. Ao abrir a
//    Ronda de um posto, o aparelho passa a ser "do posto" (continua depois do
//    Sair) e agenda no Android os horários da ronda e o Sempre Alerta; a
//    agenda é revista a cada 30 min (ação agenda-posto, sem login). O "Estou
//    bem" vai pela mesma fila offline.
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
    'maximize': '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>',
    'bell': '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
    'heart': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>'
  };
  Object.keys(EXTRA_ICONS).forEach(function(k) { if (!L.ICONS[k]) L.ICONS[k] = EXTRA_ICONS[k]; });

  var icon = L.icon;
  var esc = L.escapeHtml;

  var SESSAO_KEY = 'gss_ronda_sessao';
  var APARELHO_KEY = 'gss_ronda_aparelho'; // posto a que o celular fixo pertence (alarmes)
  var AGENDA_MS = 30 * 60 * 1000;
  var XIAOMI_OK_KEY = 'gss_ronda_xiaomi_ok'; // "Já configurei" do aviso da Xiaomi
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

  var ACAO_DA_OP = { iniciar: 'iniciar', leitura: 'registrar-leitura', encerrar: 'encerrar', trajeto: 'registrar-trajeto', prova: 'prova-vida' };

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
              var oque = op.tipo === 'leitura' ? 'Leitura de "' + (op.rotulo || 'ponto') + '"'
                : op.tipo === 'prova' ? 'Confirmação do Sempre Alerta' : 'Operação da ronda';
              toast(oque + ' recusada: ' + e.message, 'erro');
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
        '<div class="rd-topo-marca"><img src="logo-gss.png" alt="GSS" class="rd-topo-logo">Ronda</div>' +
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
          '<div id="rd-abertas"></div>' +
          '<div class="rd-card">' +
            '<div class="rd-card-titulo" id="rd-sit-titulo">Situação do ponto</div>' +
            '<div id="rd-chk-apoio"></div>' +
            '<div class="rd-escolha">' +
              '<button id="rd-op-ok" onclick="GSSRonda.escolherStatus(\'ok\')">' + icon('check-circle', 22) + '<span>Sem alteração</span></button>' +
              '<button id="rd-op-anomalia" onclick="GSSRonda.escolherStatus(\'anomalia\')">' + icon('alert-triangle', 22) + '<span>Anormalidade</span></button>' +
            '</div>' +
            '<div id="rd-anomalia-campos" style="display:none">' +
              '<div id="rd-chk-marcar"></div>' +
              '<div class="form-field"><label>' + icon('alert-triangle', 13) + ' Urgência <span class="required">*</span></label>' +
                '<select id="rd-urgencia">' + URGENCIAS.map(function(u) { return '<option value="' + u[0] + '">' + u[1] + '</option>'; }).join('') + '</select></div>' +
              '<div class="form-field"><label>' + icon('file-text', 13) + ' <span id="rd-obs-rotulo">O que foi encontrado</span> <span class="required" id="rd-obs-obrig">*</span></label>' +
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
      '<div class="rd-alarme" id="rd-alarme" role="alertdialog" aria-live="assertive">' +
        '<img src="logo-gss.png" alt="GSS" class="rd-alarme-logo">' +
        '<div class="rd-alarme-ico" id="rd-alarme-ico"></div>' +
        '<h2 id="rd-alarme-titulo"></h2>' +
        '<p id="rd-alarme-sub"></p>' +
        '<div class="rd-alarme-acoes" id="rd-alarme-acoes"></div>' +
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
    setTimeout(atualizarInfoAlarme, 0);
    return '<div class="rd-hub-titulo">' + icon('shield', 14) + 'Ronda</div>' +
      '<div class="rd-alarme-info"></div>' +
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
      vincularAparelho(ctx.config);
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

  function sequencial() { return !!(st.ctx && st.ctx.config && st.ctx.config.ronda_sequencial); }

  // Na ronda em sequência: o primeiro ponto da ordem cadastrada ainda não lido
  // (st.ctx.pontos já vem ordenado por ordem, nome).
  function proximoPonto() {
    var mapa = lidasPorPonto();
    return st.ctx.pontos.find(function(p) { return !mapa[p.id]; }) || null;
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
        'Iniciar Ronda<small>' + n + ' ponto' + (n > 1 ? 's' : '') + ' a percorrer' + (sequencial() ? ' · em sequência' : '') + '</small></button>';
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

    corpo.innerHTML = html + '<div class="rd-alarme-info"></div>' + botoesRodape();
    atualizarInfoAlarme();
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
      informarEstadoRonda();
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
    var seq = sequencial();
    var proximo = seq ? proximoPonto() : null;

    var grade = pontos.map(function(p, i) {
      var l = mapa[p.id];
      var cls = !l ? '' : l.status === 'anomalia' ? 'anomalia' : 'feito';
      if (l && l._pendente) cls += ' pendente-envio';
      if (proximo && proximo.id === p.id) cls += ' proximo';
      var ic = !l ? 'circle' : l.status === 'anomalia' ? 'alert-triangle' : 'check-circle';
      var nAbertas = (p.abertas || []).length;
      return '<div class="rd-ponto ' + cls + '"><span class="ico">' + icon(ic, 15) + '</span><span>' + (seq ? (i + 1) + '. ' : '') + esc(p.nome) +
        (l ? '<small>' + hora(l.lida_em) + (l._pendente ? ' · na fila' : '') + '</small>' : '') +
        (nAbertas ? '<small class="rd-ponto-aberta">' + icon('alert-triangle', 10) + ' ' + nAbertas + ' em aberto</small>' : '') + '</span></div>';
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
        : '<button class="rd-btn-grande" onclick="GSSRonda.abrirScanner()">' + icon('maximize', 28) + 'Escanear QR do Ponto<small>' + (proximo ? 'próximo: ' + esc(proximo.nome) : 'aponte a câmera para a etiqueta') + '</small></button>') +
      '<div class="rd-gps rd-trj" id="rd-trj"></div>' +
      '<div class="rd-card"><div class="rd-card-titulo">Pontos' + (seq ? ' · siga a ordem' : '') + '</div><div class="rd-pontos">' + grade + '</div></div>' +
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
      if (sequencial()) {
        var proximo = proximoPonto();
        if (proximo && proximo.id !== ponto.id) { avisoScanner('Siga a ordem da ronda: o próximo ponto é "' + proximo.nome + '".'); return; }
      }
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
    leitura.abertas = (ponto.abertas || []).slice();
    leitura.respostas = {};
    leitura.nc = {};
    renderChecklist();
    renderAbertas();
    L.showScreen('ronda-registro-screen');
    atualizarAbertasDoPonto(leitura);
  }

  // ─── ANORMALIDADES EM ABERTO NO PONTO (constatações) ─────────────────────
  var SITUACOES = [
    ['sem_alteracao', 'SEM ALTERAÇÃO', 'continua igual'],
    ['agravou', 'AGRAVOU', 'foto nova e urgência'],
    ['finalizado', 'FINALIZADO', 'não está mais ocorrendo — a supervisão encerra no Livro']
  ];
  var ORDEM_URG = URGENCIAS.map(function(u) { return u[0]; });

  function rotuloUrg(u) {
    var x = URGENCIAS.filter(function(v) { return v[0] === u; })[0];
    return x ? x[1] : (u || '-');
  }

  function dataHoraCurta(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + hora(iso);
  }

  // Lista fresca do servidor (outro vigilante pode ter registrado ou alguém
  // encerrado agora). Sem sinal em 3 s, fica a do cache.
  function atualizarAbertasDoPonto(leitura) {
    if (navigator.onLine === false) return;
    var limite = new Promise(function(resolve) { setTimeout(function() { resolve(null); }, 3000); });
    Promise.race([api('abertas-ponto', Object.assign(base(), { id_ponto: leitura.ponto.id })).catch(function() { return null; }), limite]).then(function(res) {
      if (!res || !res.abertas || st.leitura !== leitura) return;
      leitura.abertas = res.abertas;
      Object.keys(leitura.respostas).forEach(function(id) {
        if (!res.abertas.some(function(a) { return a.id === id; })) delete leitura.respostas[id];
      });
      leitura.ponto.abertas = res.abertas.slice();
      salvarCtxCache();
      renderAbertas();
    });
  }

  function renderAbertas() {
    var l = st.leitura;
    var el = document.getElementById('rd-abertas');
    if (!l || !el) return;
    var tem = l.abertas && l.abertas.length;
    document.getElementById('rd-sit-titulo').textContent = tem ? 'Outra anormalidade neste ponto?' : 'Situação do ponto';
    document.querySelector('#rd-op-ok span').textContent = tem ? 'Nenhuma outra anormalidade' : 'Sem alteração';
    document.querySelector('#rd-op-anomalia span').textContent = tem ? 'Nova anormalidade' : 'Anormalidade';
    if (!tem) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="rd-card rd-abertas">' +
      '<div class="rd-card-titulo" style="color:#b45309">' + icon('alert-triangle', 13) + ' Anormalidade em aberto neste ponto' + (l.abertas.length > 1 ? ' (' + l.abertas.length + ')' : '') + '</div>' +
      l.abertas.map(function(a, i) {
        var r = l.respostas[a.id] || {};
        return '<div class="rd-aberta">' +
          '<div class="rd-aberta-topo">' +
            (a.foto_url ? '<img class="rd-aberta-foto" src="' + esc(a.foto_url) + '" alt="" onerror="this.style.display=\'none\'" onclick="window.open(this.src)">' : '') +
            '<div class="rd-aberta-info">' +
              '<div class="rd-aberta-prot">' + esc(a.protocolo || '') + ' <span class="rd-urg u-' + esc(a.urgencia || '') + '">' + esc(rotuloUrg(a.urgencia)) + '</span></div>' +
              '<div class="rd-aberta-meta">Aberta em ' + dataHoraCurta(a.inicio) + (a.colaborador ? ' por ' + esc(a.colaborador) : '') + '</div>' +
              (a.relato ? '<div class="rd-aberta-relato">' + esc(a.relato) + '</div>' : '') +
              '<div class="rd-aberta-meta">' + (a.constatacoes ? 'Constatada ' + a.constatacoes + ' vez' + (a.constatacoes > 1 ? 'es' : '') + ' na ronda' +
                (a.ultima_em ? ' · última em ' + dataHoraCurta(a.ultima_em) : '') : 'Ainda não constatada por outra ronda') + '</div>' +
              (a.finalizado_em ? '<div class="rd-aberta-final">' + icon('check-circle', 12) + ' Ronda informou FINALIZADO em ' + dataHoraCurta(a.finalizado_em) + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="rd-aberta-pergunta">Situação atual</div>' +
          '<div class="rd-sit">' + SITUACOES.map(function(x) {
            return '<button type="button" class="' + (r.situacao === x[0] ? 'sel sel-' + x[0] : '') + '" onclick="GSSRonda.responderAberta(' + i + ', \'' + x[0] + '\')">' +
              '<b>' + x[1] + '</b><small>' + x[2] + '</small></button>';
          }).join('') + '</div>' +
          (r.situacao === 'agravou' ? htmlAgravou(a, i, r) : '') +
        '</div>';
      }).join('') + '</div>';
  }

  function htmlAgravou(a, i, r) {
    var atual = Math.max(0, ORDEM_URG.indexOf(a.urgencia));
    return '<div class="rd-agravou">' +
      '<div class="form-field"><label>' + icon('camera', 13) + ' Foto de como está agora <span class="required">*</span></label>' +
        '<div class="rd-fotos">' +
          '<button type="button" class="btn btn-primary icon-inline" onclick="document.getElementById(\'rd-ab-cam-' + i + '\').click()">' + icon('camera', 15) + 'Tirar foto</button>' +
          '<button type="button" class="btn btn-outline icon-inline" onclick="document.getElementById(\'rd-ab-gal-' + i + '\').click()">' + icon('image', 15) + 'Galeria</button>' +
        '</div>' +
        '<input type="file" accept="image/*" capture="environment" id="rd-ab-cam-' + i + '" style="display:none" onchange="GSSRonda.fotoAberta(' + i + ', this.files[0])">' +
        '<input type="file" accept="image/*" id="rd-ab-gal-' + i + '" style="display:none" onchange="GSSRonda.fotoAberta(' + i + ', this.files[0])">' +
        (r.foto ? '<img class="rd-preview" style="display:block" src="' + r.foto + '" alt="Prévia">' : r.processandoFoto ? '<div style="font-size:12px;color:var(--text2)">Processando a foto…</div>' : '') +
      '</div>' +
      '<div class="form-field"><label>' + icon('alert-triangle', 13) + ' Urgência <span class="required">*</span></label>' +
        '<select onchange="GSSRonda.urgenciaAberta(' + i + ', this.value)">' +
          URGENCIAS.filter(function(u, k) { return k >= atual; }).map(function(u) {
            return '<option value="' + u[0] + '"' + ((r.urgencia || a.urgencia) === u[0] ? ' selected' : '') + '>' + u[1] + '</option>';
          }).join('') +
        '</select></div>' +
      '<div class="form-field"><label>' + icon('file-text', 13) + ' O que mudou? (opcional)</label>' +
        '<textarea placeholder="Descreva a mudança…" style="min-height:70px" oninput="GSSRonda.obsAberta(' + i + ', this.value)">' + esc(r.obs || '') + '</textarea></div>' +
    '</div>';
  }

  function respostaDa(i) {
    var l = st.leitura;
    if (!l || !l.abertas[i]) return null;
    var id = l.abertas[i].id;
    return l.respostas[id] || (l.respostas[id] = {});
  }

  function responderAberta(i, situacao) {
    var r = respostaDa(i);
    if (!r) return;
    r.situacao = situacao;
    if (situacao === 'agravou' && !r.urgencia) r.urgencia = st.leitura.abertas[i].urgencia || 'NAO_URGENTE';
    renderAbertas();
  }

  function fotoAberta(i, arquivo) {
    var r = respostaDa(i), leitura = st.leitura;
    if (!r || !arquivo) return;
    r.processandoFoto = true;
    renderAbertas();
    comprimirImagem(arquivo, 1280, 0.7).then(function(dataUrl) {
      r.foto = dataUrl;
      r.processandoFoto = false;
      if (st.leitura === leitura) renderAbertas();
    }).catch(function() {
      r.processandoFoto = false;
      if (st.leitura === leitura) renderAbertas();
      toast('Não foi possível processar essa foto — tente outra.', 'erro');
    });
  }

  // Confere as respostas e monta as constatações (null = falta algo; já avisou).
  function montarConstatacoes(l) {
    var lista = [];
    for (var k = 0; k < (l.abertas || []).length; k++) {
      var a = l.abertas[k], r = l.respostas[a.id];
      if (!r || !r.situacao) { toast('Informe a situação atual da ocorrência ' + (a.protocolo || '') + '.', 'erro'); return null; }
      if (r.situacao === 'agravou') {
        if (r.processandoFoto) { toast('Aguarde — processando a foto.'); return null; }
        if (!r.foto) { toast('Em AGRAVOU, tire uma foto de como está agora.', 'erro'); return null; }
      }
      lista.push({
        id: r.idConstatacao || (r.idConstatacao = uuid()),
        id_ocorrencia: a.id, situacao: r.situacao,
        urgencia: r.situacao === 'agravou' ? (r.urgencia || a.urgencia) : null,
        obs: r.situacao === 'agravou' ? (r.obs || '').trim() || null : null,
        foto: r.situacao === 'agravou' ? r.foto : null
      });
    }
    return lista;
  }

  // Reflete no cache o que o aparelho acabou de registrar: o próximo
  // vigilante neste celular vê o estado certo mesmo sem sinal.
  function aplicarConstatacoesLocais(ponto, constatacoes, lidaEm, resultados) {
    var abertas = ponto.abertas || [];
    constatacoes.forEach(function(c) {
      var a = abertas.filter(function(x) { return x.id === c.id_ocorrencia; })[0];
      var res = (resultados || []).filter(function(x) { return x.id === c.id; })[0];
      if (res && res.resultado === 'descartada') { ponto.abertas = abertas = abertas.filter(function(x) { return x.id !== c.id_ocorrencia; }); return; }
      if (res && res.resultado === 'reaberta') {
        abertas = abertas.filter(function(x) { return x.id !== c.id_ocorrencia; });
        abertas.unshift({ id: res.id_ocorrencia, protocolo: res.protocolo, urgencia: c.urgencia || (a && a.urgencia) || 'NAO_URGENTE',
          inicio: lidaEm, colaborador: st.usuario.nome, relato: (a && a.relato) || '', constatacoes: 0, ultima_em: null, finalizado_em: null, foto_url: a ? a.foto_url : null });
        ponto.abertas = abertas;
        return;
      }
      if (!a || (res && res.resultado === 'ja_registrada')) return;
      if (c.situacao === 'finalizado') { a.finalizado_em = lidaEm; return; }
      a.constatacoes = (a.constatacoes || 0) + 1;
      a.ultima_em = lidaEm;
      a.finalizado_em = null;
      if (c.situacao === 'agravou' && ORDEM_URG.indexOf(c.urgencia) > ORDEM_URG.indexOf(a.urgencia)) a.urgencia = c.urgencia;
    });
    salvarCtxCache();
  }

  function escolherStatus(status) {
    if (!st.leitura) return;
    st.leitura.status = status;
    document.getElementById('rd-op-ok').className = status === 'ok' ? 'sel-ok' : '';
    document.getElementById('rd-op-anomalia').className = status === 'anomalia' ? 'sel-anomalia' : '';
    document.getElementById('rd-anomalia-campos').style.display = status === 'anomalia' ? 'block' : 'none';
    renderChecklist();
    // Com checklist o vigilante começa marcando os itens; sem, escrevendo.
    if (status === 'anomalia' && !checklistDoPonto()) setTimeout(function() { document.getElementById('rd-obs').focus(); }, 50);
  }

  // ─── CHECKLIST DO PONTO (módulo Checklists) ──────────────────────────────
  // Só apoio: ao ler o QR mostra o que verificar, sem marcar nada. Na
  // Anormalidade os itens viram seleção do que NÃO está OK — vão para a
  // ocorrência sob "Itens sinalizados no checklist:".
  function checklistDoPonto() {
    var c = st.leitura && st.leitura.ponto.checklist;
    return c && c.itens && c.itens.length ? c : null;
  }

  function renderChecklist() {
    var l = st.leitura;
    var apoio = document.getElementById('rd-chk-apoio');
    var marcar = document.getElementById('rd-chk-marcar');
    if (!l || !apoio || !marcar) return;
    var c = checklistDoPonto();
    var anomalia = l.status === 'anomalia';
    document.getElementById('rd-obs-rotulo').textContent = c ? 'Observação' : 'O que foi encontrado';
    document.getElementById('rd-obs-obrig').style.display = c ? 'none' : '';
    document.getElementById('rd-obs').placeholder = c ? 'Detalhe o que foi encontrado (opcional se marcou algum item)…' : 'Descreva a anormalidade…';
    if (!c) { apoio.innerHTML = ''; marcar.innerHTML = ''; return; }

    apoio.innerHTML = anomalia ? '' :
      '<div class="rd-chk-apoio"><div class="rd-chk-titulo">' + icon('clipboard', 14) + ' Verifique neste ponto</div><ul>' +
      c.itens.map(function(i) { return '<li>' + esc(i.texto) + '</li>'; }).join('') + '</ul></div>';

    marcar.innerHTML = !anomalia ? '' :
      '<div class="form-field"><label>' + icon('clipboard', 13) + ' O que não está OK? <span class="rd-chk-dica">toque nos itens</span></label>' +
      '<div class="rd-chk-lista">' + c.itens.map(function(i) {
        var m = l.nc[i.id];
        return '<div class="rd-chk-item' + (m ? ' nc' : '') + '">' +
          '<button type="button" data-id="' + esc(i.id) + '" onclick="GSSRonda.marcarItemNc(this.dataset.id)">' +
            '<span class="rd-chk-caixa">' + (m ? icon('x', 14) : '') + '</span><span>' + esc(i.texto) + '</span></button>' +
          (m ? '<input type="text" maxlength="500" placeholder="Detalhe (opcional)" value="' + esc(m.obs || '') + '" ' +
            'data-id="' + esc(i.id) + '" oninput="GSSRonda.obsItemNc(this.dataset.id, this.value)">' : '') +
        '</div>';
      }).join('') + '</div></div>';
  }

  function marcarItemNc(id) {
    var l = st.leitura;
    if (!l) return;
    if (l.nc[id]) delete l.nc[id]; else l.nc[id] = { obs: '' };
    renderChecklist();
  }

  function obsItemNc(id, valor) {
    if (st.leitura && st.leitura.nc[id]) st.leitura.nc[id].obs = valor;
  }

  function itensNcDaLeitura(l) {
    var c = l.ponto.checklist;
    if (!c || !c.itens) return [];
    return c.itens.filter(function(i) { return l.nc[i.id]; }).map(function(i) {
      var obs = (l.nc[i.id].obs || '').trim();
      return obs ? { item_id: i.id, texto: i.texto, obs: obs } : { item_id: i.id, texto: i.texto };
    });
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
    var nc = l.status === 'anomalia' ? itensNcDaLeitura(l) : [];
    if (l.status === 'anomalia') {
      if (!obs && !nc.length) {
        toast(checklistDoPonto() ? 'Marque o que não está OK ou descreva a anormalidade.' : 'Descreva a anormalidade.', 'erro');
        if (!checklistDoPonto()) document.getElementById('rd-obs').focus();
        return;
      }
      if (l.processandoFoto) { toast('Aguarde — processando a foto.'); return; }
      if (st.ctx.config && st.ctx.config.exigir_foto_anomalia && !l.foto) { toast('Este posto exige foto na anormalidade.', 'erro'); return; }
    }

    var constatacoes = montarConstatacoes(l);
    if (!constatacoes) return;

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
      if (constatacoes.length) dados.constatacoes = constatacoes;
      if (nc.length) {
        dados.checklist_nc = nc;
        dados.checklist_modelo_id = l.ponto.checklist.id_modelo;
        dados.checklist_versao = l.ponto.checklist.versao;
      }
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
        if (dados.constatacoes) aplicarConstatacoesLocais(ponto, dados.constatacoes, dados.lida_em, null);
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
        var resultados = res.constatacoes || [];
        if (dados.constatacoes) aplicarConstatacoesLocais(ponto, dados.constatacoes, dados.lida_em, resultados);
        // Anormalidade nova neste ponto: aparece para o próximo vigilante que ler o QR.
        if (res.protocolo && res.leitura && res.leitura.id_ocorrencia) {
          ponto.abertas = [{ id: res.leitura.id_ocorrencia, protocolo: res.protocolo, urgencia: dados.urgencia, inicio: dados.lida_em,
            colaborador: st.usuario.nome, relato: dados.obs || '', constatacoes: 0, ultima_em: null, finalizado_em: null, foto_url: null }].concat(ponto.abertas || []);
          salvarCtxCache();
        }
        var reaberta = resultados.filter(function(x) { return x.resultado === 'reaberta'; })[0];
        var registradas = resultados.filter(function(x) { return x.resultado === 'registrada'; });
        if (reaberta) toast('A ocorrência ' + (reaberta.protocolo_anterior || '') + ' já estava encerrada — aberta nova ' + reaberta.protocolo, 'ok');
        else if (res.protocolo) toast('Anormalidade lançada no Livro — protocolo ' + res.protocolo, 'ok');
        else if (registradas.length) toast('Situação registrada na ocorrência ' + registradas.map(function(x) { return x.protocolo; }).join(', '), 'ok');
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
      informarEstadoRonda();
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

  // ─── ALARMES DO APARELHO (horários da ronda / Sempre Alerta) ────────────
  // Só no app Android 1.0.3+. O celular fica fixo no posto: o vínculo é do
  // aparelho, não do login, e não se desfaz no Sair.
  var alarme = { info: null, atual: null, enviando: false };

  function nativoAlarme() {
    var N = window.GSSNativo;
    return N && N.ativo && N.alarmeAgendar ? N : null;
  }

  function aparelho() {
    try { return JSON.parse(localStorage.getItem(APARELHO_KEY)); } catch (e) { return null; }
  }

  // Posto aberto passa a ser o do aparelho; a agenda vem na config do contexto.
  function vincularAparelho(config) {
    var N = nativoAlarme();
    if (!N || !st.posto || !config) return;
    var novo = { id_posto: st.posto.id_posto, nome_posto: st.posto.nome_posto };
    var antes = aparelho();
    try { localStorage.setItem(APARELHO_KEY, JSON.stringify(novo)); } catch (e) {}
    aplicarAgenda(config).then(function() {
      informarEstadoRonda();
      if (!antes || antes.id_posto !== novo.id_posto) conferirPermissoesAlarme(true);
    });
  }

  function temAlgoAgendado(ag) {
    return !!(ag && ((ag.horarios && ag.horarios.length) || ag.alerta_ativo));
  }

  function aplicarAgenda(ag) {
    var N = nativoAlarme(), ap = aparelho();
    if (!N || !ap) return Promise.resolve();
    var dados = Object.assign({ horarios: [], alerta_ativo: false }, ag || {}, { id_posto: ap.id_posto, nome_posto: ap.nome_posto });
    return N.alarmeAgendar(dados).then(function(info) {
      alarme.info = Object.assign(info || {}, { ativo: temAlgoAgendado(dados) });
      atualizarInfoAlarme();
    }).catch(function() {});
  }

  // Revisão periódica pelo servidor — funciona sem ninguém logado.
  function sincronizarAgenda() {
    var ap = aparelho();
    if (!nativoAlarme() || !ap || navigator.onLine === false) return;
    api('agenda-posto', { id_posto: ap.id_posto }).then(function(res) {
      return aplicarAgenda(res.agenda);
    }).catch(function() {});
  }

  function informarEstadoRonda() {
    var N = nativoAlarme(), ap = aparelho();
    if (!N || !ap || !st.posto || st.posto.id_posto !== ap.id_posto || !st.ctx) return;
    var r = st.ctx.ronda;
    N.alarmeEstadoRonda({ emAndamento: !!r, iniciadaEm: r ? new Date(r.iniciada_em).getTime() : 0 }).catch(function() {});
    if (r) esconderAlarme('ronda');
  }

  // Android 13+ pede permissão de notificação; 14+ pode barrar a tela cheia.
  function conferirPermissoesAlarme(pedir) {
    var N = nativoAlarme();
    if (!N) return Promise.resolve();
    return N.alarmePermissoes().then(function(p) {
      if (!p.notificacoes && pedir) return N.pedirPermissaoNotificacao();
      return p;
    }).then(function(p) {
      if (alarme.info && p) alarme.info.permissoes = p;
      atualizarInfoAlarme();
    }).catch(function() {});
  }

  function dataHora(ms) {
    var d = new Date(ms);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function xiaomiMarcado() {
    try { return localStorage.getItem(XIAOMI_OK_KEY) === '1'; } catch (e) { return false; }
  }

  // Xiaomi/Redmi/POCO: sem "Início automático" o sistema encerra o app ao
  // bloquear a tela e os alarmes somem. Não há como o app ligar isso sozinho.
  function htmlXiaomi(x) {
    if (!x || !x.xiaomi) return '';
    var itens = [
      ['autostart', 'Início automático', 'ligar para o GSS Legion', x.inicioAutomatico],
      ['permissoes', 'Mostrar na tela de bloqueio e Abrir janelas em segundo plano', 'permitir as duas', x.telaBloqueio === false || x.segundoPlano === false ? false : (x.telaBloqueio && x.segundoPlano ? true : null)],
      ['bateria', 'Economia de bateria', 'escolher "Sem restrições"', x.bateriaLiberada ? true : null]
    ];
    var algumNegado = itens.some(function(it) { return it[3] === false; });
    if (xiaomiMarcado() && !algumNegado) {
      return '<div class="rd-alarme-linha rd-alarme-xiaomi-ok">' + icon('check-circle', 13) + '<span>Xiaomi configurado para o alarme</span>' +
        '<button class="btn btn-outline" onclick="GSSRonda.xiaomiRever()">Rever</button></div>';
    }
    return '<div class="rd-alarme-xiaomi">' +
      '<div class="rd-alarme-xiaomi-tit">' + icon('alert-triangle', 14) + 'Celular Xiaomi: libere o alarme</div>' +
      '<div class="rd-alarme-xiaomi-sub">Sem isso a Xiaomi fecha o app ao bloquear a tela e o alarme não toca.</div>' +
      itens.map(function(it) {
        var estado = it[3] === true ? '<span class="ok">' + icon('check', 11) + ' ok</span>'
          : it[3] === false ? '<span class="nao">desligado</span>' : '<span class="conf">conferir</span>';
        return '<div class="rd-alarme-xiaomi-item"><div><b>' + it[1] + '</b> — ' + it[2] + ' ' + estado + '</div>' +
          '<button class="btn btn-outline" onclick="GSSRonda.abrirXiaomi(\'' + it[0] + '\')">Abrir</button></div>';
      }).join('') +
      '<button class="btn btn-primary" onclick="GSSRonda.xiaomiConfigurado()">Já configurei</button>' +
    '</div>';
  }

  function atualizarInfoAlarme() {
    var els = document.querySelectorAll('.rd-alarme-info');
    var i = alarme.info;
    var html = '';
    if (i && i.id_posto) {
      var p = i.permissoes || {};
      var faltas = [];
      if (p.notificacoes === false) faltas.push(['notificacoes', 'Notificações do app desligadas — o alarme não toca.']);
      if (p.telaCheia === false) faltas.push(['telaCheia', 'Alarme em tela cheia bloqueado — com a tela apagada ele não aparece.']);
      if (p.alarmeExato === false) faltas.push(['alarmeExato', 'Alarme na hora exata bloqueado — pode tocar com atraso.']);
      html = '<div class="rd-alarme-linha">' + icon('bell', 13) + '<span>Alarmes deste aparelho: <b>' + esc(i.nome_posto || i.id_posto) + '</b>' +
        (i.ativo && i.proximo_em ? ' · próximo às <b>' + hora(new Date(i.proximo_em).toISOString()) + '</b>' : i.ativo ? '' : ' · nenhum horário cadastrado') + '</span></div>' +
        faltas.map(function(f) {
          return '<div class="rd-alarme-falta">' + icon('alert-triangle', 13) + '<span>' + f[1] + '</span>' +
            '<button class="btn btn-outline" onclick="GSSRonda.corrigirAlarme(\'' + f[0] + '\')">Corrigir</button></div>';
        }).join('') +
        htmlXiaomi(i.xiaomi) +
        (i.disparado_em !== undefined ? '<div class="rd-alarme-teste">' +
          '<span>' + (i.teste_em ? 'Teste marcado para <b>' + dataHora(i.teste_em) + '</b> — bloqueie a tela e aguarde.'
            : 'Último disparo do alarme: <b>' + (i.disparado_em ? dataHora(i.disparado_em) : 'nunca') + '</b>') + '</span>' +
          '<button class="btn btn-outline" onclick="GSSRonda.testarAlarme()">' + icon('bell', 13) + ' Testar alarme (1 min)</button></div>' : '');
    }
    els.forEach(function(el) { el.innerHTML = html; });
  }

  function carregarInfoAlarme() {
    var N = nativoAlarme();
    if (!N) return;
    N.alarmeInfo().then(function(info) {
      if (!info || !info.id_posto) return;
      alarme.info = Object.assign(info, { ativo: temAlgoAgendado(info) });
      atualizarInfoAlarme();
    }).catch(function() {});
  }

  // Alarme tocando (ou aberto por ele): mostra o aviso por cima de tudo.
  function verificarAlarmes() {
    var N = nativoAlarme();
    if (!N) return;
    N.alarmePendente().then(function(p) {
      if (!p) return;
      if (p.alerta) mostrarAlarme('alerta', p.alerta, p.nome_posto);
      else if (p.ronda) mostrarAlarme('ronda', p.ronda, p.nome_posto);
      else if (p.teste) mostrarAlarme('teste', p.teste, p.nome_posto);
      else esconderAlarme();
    }).catch(function() {});
  }

  function mostrarAlarme(tipo, previsto, nomePosto) {
    alarme.atual = { tipo: tipo, previsto: previsto };
    var el = document.getElementById('rd-alarme');
    var h = hora(new Date(previsto).toISOString());
    el.className = 'rd-alarme ativo ' + tipo;
    if (tipo === 'alerta') {
      document.getElementById('rd-alarme-ico').innerHTML = icon('heart', 44);
      document.getElementById('rd-alarme-titulo').textContent = 'Sempre Alerta';
      document.getElementById('rd-alarme-sub').textContent = (nomePosto || '') + ' · ' + h + ' — confirme que está tudo bem.';
      document.getElementById('rd-alarme-acoes').innerHTML =
        '<button class="rd-btn-grande rd-btn-ok" id="rd-btn-estoubem" onclick="GSSRonda.estouBem()">' + icon('check-circle', 28) + 'Estou bem</button>';
    } else if (tipo === 'teste') {
      document.getElementById('rd-alarme-ico').innerHTML = icon('bell', 44);
      document.getElementById('rd-alarme-titulo').textContent = 'Teste do alarme';
      document.getElementById('rd-alarme-sub').textContent = 'O alarme está funcionando neste aparelho (' + h + ').';
      document.getElementById('rd-alarme-acoes').innerHTML =
        '<button class="rd-btn-grande rd-btn-ok" onclick="GSSRonda.fecharTeste()">' + icon('check-circle', 28) + 'OK</button>';
    } else {
      document.getElementById('rd-alarme-ico').innerHTML = icon('bell', 44);
      document.getElementById('rd-alarme-titulo').textContent = 'Hora da ronda — ' + h;
      document.getElementById('rd-alarme-sub').textContent = nomePosto || '';
      document.getElementById('rd-alarme-acoes').innerHTML =
        '<button class="rd-btn-grande" onclick="GSSRonda.iniciarPeloAlarme()">' + icon('play', 26) + 'Iniciar ronda</button>' +
        '<button class="btn btn-outline rd-btn-adiar" onclick="GSSRonda.adiarAlarme()">' + icon('clock', 15) + ' Adiar 5 min</button>';
    }
  }

  function esconderAlarme(tipo) {
    if (tipo && alarme.atual && alarme.atual.tipo !== tipo) return;
    alarme.atual = null;
    var el = document.getElementById('rd-alarme');
    if (el) el.className = 'rd-alarme';
  }

  // Posto do aparelho aberto e com contexto? Senão, sessão guardada; senão,
  // o hub do usuário logado; por último, pede o login.
  function iniciarPeloAlarme() {
    var N = nativoAlarme(), ap = aparelho();
    if (N) N.alarmeSilenciar('ronda').catch(function() {});
    esconderAlarme();
    setTimeout(verificarAlarmes, 300); // Sempre Alerta tocando ao mesmo tempo
    if (!ap) return;
    if (st.posto && st.posto.id_posto === ap.id_posto && st.ctx) {
      if (st.ctx.ronda) { L.showScreen('ronda-exec-screen'); renderExec(); }
      else { L.showScreen('ronda-inicio-screen'); renderInicio(); if (st.ctx.pontos.length) iniciar(); }
      return;
    }
    var noHub = st.usuario && (st.hub || []).filter(function(h) { return h.id_posto === ap.id_posto; })[0];
    if (noHub) { abrir(noHub); return; }
    try {
      var s = JSON.parse(localStorage.getItem(SESSAO_KEY));
      if (s && s.posto && s.posto.id_posto === ap.id_posto && Date.now() - s.ts < SESSAO_MAX_MS && window.GSSRonda.restaurar()) return;
    } catch (e) {}
    toast('Faça login para iniciar a ronda.');
  }

  function adiarAlarme() {
    var N = nativoAlarme();
    esconderAlarme();
    if (N) N.alarmeAdiar(5).then(function(info) {
      if (info && alarme.info) { alarme.info.proximo_em = info.proximo_em; atualizarInfoAlarme(); }
    }).catch(function() {});
    toast('O alarme toca de novo em 5 minutos.');
  }

  // "Estou bem": o toque para na hora; o GPS (até 8 s) vai junto para o
  // servidor conferir se o aparelho está no posto. Sem sinal → fila offline.
  function estouBem() {
    var N = nativoAlarme(), ap = aparelho(), atual = alarme.atual;
    if (!ap || !atual || alarme.enviando) return;
    alarme.enviando = true;
    if (N) N.alarmeSilenciar('alerta').catch(function() {});
    var btn = document.getElementById('rd-btn-estoubem');
    if (btn) btn.disabled = true;
    var respondido = new Date().toISOString();
    var logado = st.usuario && st.usuario.id ? st.usuario.id : null;
    var gps = Promise.race([obterLocalizacao(), new Promise(function(r) { setTimeout(function() { r(null); }, 8000); })]);
    gps.then(function(loc) {
      var op = {
        tipo: 'prova', id_acesso: logado, id_posto: ap.id_posto,
        dados: {
          id: uuid(), previsto_em: new Date(atual.previsto).toISOString(), respondido_em: respondido,
          lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, precisao_m: loc ? loc.precisao_m : null,
          aparelho: navigator.userAgent.slice(0, 120)
        }
      };
      return filaListar().then(function(ops) {
        if (ops.length) return filaAdicionar(op).then(function() { processarFila(); });
        return api('prova-vida', Object.assign({ id_acesso: op.id_acesso, id_posto: op.id_posto }, op.dados))
          .catch(function(e) { if (semRede(e) || e.status >= 500) return filaAdicionar(op); throw e; });
      });
    }).then(function() {
      toast('Confirmado. Bom serviço!', 'ok');
    }, function(e) {
      toast('Confirmação recusada: ' + e.message, 'erro');
    }).then(function() {
      alarme.enviando = false;
      esconderAlarme('alerta');
      setTimeout(verificarAlarmes, 300);
    });
  }

  function iniciarAlarmes() {
    var N = nativoAlarme();
    if (!N) return;
    if (N.aoAlarme) N.aoAlarme(function() { verificarAlarmes(); carregarInfoAlarme(); });
    var ultimaRevisao = 0;
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState !== 'visible') return;
      verificarAlarmes();
      carregarInfoAlarme();
      if (Date.now() - ultimaRevisao > 2 * 60 * 1000) { ultimaRevisao = Date.now(); sincronizarAgenda(); }
    });
    setTimeout(verificarAlarmes, 400); // app aberto a frio pelo alarme
    carregarInfoAlarme();
    setTimeout(sincronizarAgenda, 3000);
    setInterval(sincronizarAgenda, AGENDA_MS);
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
      // Sem ninguém logado, o "Estou bem" do celular fixo sai sem nome
      // (voltarHub guarda o usuário antes e o hub o repõe).
      st.usuario = null;
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
    marcarItemNc: marcarItemNc,
    obsItemNc: obsItemNc,
    responderAberta: responderAberta,
    fotoAberta: fotoAberta,
    urgenciaAberta: function(i, u) { var r = respostaDa(i); if (r) r.urgencia = u; },
    obsAberta: function(i, texto) { var r = respostaDa(i); if (r) r.obs = texto; },
    confirmarRegistro: confirmarRegistro,
    cancelarRegistro: cancelarRegistro,
    encerrar: encerrar,
    iniciarPeloAlarme: iniciarPeloAlarme,
    testarAlarme: function() {
      var N = nativoAlarme();
      if (!N || !N.alarmeTestar) return;
      N.alarmeTestar(60).then(function(info) {
        if (info && alarme.info) Object.assign(alarme.info, { teste_em: info.teste_em, disparado_em: info.disparado_em, xiaomi: info.xiaomi, permissoes: info.permissoes });
        atualizarInfoAlarme();
        toast('Teste em 1 minuto: bloqueie a tela agora e aguarde o alarme.', 'ok');
      }).catch(function() { toast('Esta versão do app não tem o teste. Instale o APK mais novo.', 'erro'); });
    },
    fecharTeste: function() {
      var N = nativoAlarme();
      if (N) N.alarmeSilenciar('teste').catch(function() {});
      esconderAlarme('teste');
      carregarInfoAlarme();
      setTimeout(verificarAlarmes, 300);
    },
    abrirXiaomi: function(qual) {
      var N = nativoAlarme();
      if (N && N.abrirAjustesXiaomi) N.abrirAjustesXiaomi(qual).catch(function() { toast('Abra Configurações → Apps → GSS Legion.', 'erro'); });
    },
    xiaomiConfigurado: function() {
      try { localStorage.setItem(XIAOMI_OK_KEY, '1'); } catch (e) {}
      atualizarInfoAlarme();
      toast('Agora toque em "Testar alarme" e bloqueie a tela para conferir.', 'ok');
    },
    xiaomiRever: function() {
      try { localStorage.removeItem(XIAOMI_OK_KEY); } catch (e) {}
      atualizarInfoAlarme();
    },
    adiarAlarme: adiarAlarme,
    estouBem: estouBem,
    corrigirAlarme: function(qual) {
      var N = nativoAlarme();
      if (!N) return;
      var abrirAjuste = function() { return N.abrirAjustesAlarme(qual); };
      (qual === 'notificacoes' ? N.pedirPermissaoNotificacao().then(function(p) { if (!p || !p.notificacoes) return abrirAjuste(); }) : abrirAjuste())
        .catch(function() {});
    }
  };

  injetarTelas();
  iniciarAlarmes();
  // Fila deixada por uma sessão anterior (ex.: aparelho ficou sem sinal e
  // a página foi fechada) — cada operação carrega o próprio id_acesso/posto.
  processarFila();
})();
