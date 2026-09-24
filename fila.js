// ═══════════════════════════════════════════════════════════════════════════════
// GSS — Requisições · fila offline e cache (fila.js)
// Requisição de materiais / entrega de EPI feita sem internet fica guardada no
// aparelho (IndexedDB) e é enviada em ordem quando a conexão volta — mesmo
// padrão da fila da Ronda (livro-remoto/ronda.js). Cada pedido leva id gerado
// no aparelho: reenvio não duplica (req-materiais / req-epis → salvar).
//   GSSReqFila.enviar(op)  — tenta na hora; sem rede → fila. Resolve
//                            { enviado: true } | { enfileirado: true } e rejeita
//                            só em recusa do servidor (4xx), com a mensagem dele.
//   GSSReqFila.listar()    — operações ainda na fila (para o histórico)
//   GSSReqCache.get/set    — cópia local do catálogo, histórico e colaboradores
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var DB_NOME = 'gss-requisicoes';
  var REENVIO_MS = 20000;
  var db = null;
  var memoria = [], seqMemoria = 1;
  var enviando = false;
  var ouvintes = [];

  function abrirDB() {
    if (db !== null) return Promise.resolve(db);
    return new Promise(function(resolve) {
      try {
        var req = indexedDB.open(DB_NOME, 1);
        req.onupgradeneeded = function() { req.result.createObjectStore('fila', { keyPath: 'seq', autoIncrement: true }); };
        req.onsuccess = function() { db = req.result; resolve(db); };
        req.onerror = function() { db = false; resolve(false); };
      } catch (e) { db = false; resolve(false); }
    });
  }

  function listar() {
    return abrirDB().then(function(d) {
      if (!d) return memoria.slice();
      return new Promise(function(resolve) {
        var itens = [];
        var cur = d.transaction('fila', 'readonly').objectStore('fila').openCursor();
        cur.onsuccess = function() { var c = cur.result; if (c) { itens.push(c.value); c.continue(); } else resolve(itens); };
        cur.onerror = function() { resolve(itens); };
      });
    }).then(function(itens) { return itens.sort(function(a, b) { return a.seq - b.seq; }); });
  }

  function gravar(op) {
    return abrirDB().then(function(d) {
      if (!d) { op.seq = seqMemoria++; memoria.push(op); return; }
      return new Promise(function(resolve) {
        var tx = d.transaction('fila', 'readwrite');
        tx.objectStore('fila').add(op);
        tx.oncomplete = resolve; tx.onerror = resolve;
      });
    });
  }

  function remover(seq) {
    return abrirDB().then(function(d) {
      if (!d) { memoria = memoria.filter(function(o) { return o.seq !== seq; }); return; }
      return new Promise(function(resolve) {
        var tx = d.transaction('fila', 'readwrite');
        tx.objectStore('fila').delete(seq);
        tx.oncomplete = resolve; tx.onerror = resolve;
      });
    });
  }

  function avisar() {
    return listar().then(function(ops) { ouvintes.forEach(function(f) { try { f(ops); } catch (e) {} }); return ops; });
  }

  // POST; erro sem status = sem rede.
  function post(op) {
    return fetch(op.url, { method: 'POST', headers: op.headers, body: JSON.stringify(op.corpo) }).then(function(resp) {
      return resp.json().catch(function() { return {}; }).then(function(body) {
        if (!resp.ok || body.error) { var e = new Error(body.error || ('Erro ' + resp.status)); e.status = resp.status; throw e; }
        return body;
      });
    });
  }

  function semRede(e) { return !e || !e.status || e.status >= 500; }

  // Envia a fila em ordem; para no primeiro erro de rede para não inverter.
  function processar() {
    if (enviando) return Promise.resolve();
    enviando = true;
    return listar().then(function(ops) {
      var cadeia = Promise.resolve(true);
      ops.forEach(function(op) {
        cadeia = cadeia.then(function(continuar) {
          if (!continuar) return false;
          return post(op).then(function() { return remover(op.seq).then(function() { return true; }); }, function(e) {
            if (semRede(e)) return false;
            // Recusa definitiva: sai da fila e fica registrada para o aviso na tela.
            return remover(op.seq).then(function() {
              recusadas.push({ rotulo: op.rotulo, erro: e.message, em: Date.now() });
              salvarRecusadas();
              return true;
            });
          });
        });
      });
      return cadeia;
    }).then(function() { enviando = false; return avisar(); }, function() { enviando = false; return avisar(); });
  }

  var recusadas = [];
  try { recusadas = JSON.parse(localStorage.getItem('gss_req_recusadas')) || []; } catch (e) {}
  function salvarRecusadas() { try { localStorage.setItem('gss_req_recusadas', JSON.stringify(recusadas)); } catch (e) {} }

  window.GSSReqFila = {
    // op: { url, headers, corpo, rotulo, resumo } — corpo já com id e registrado_em.
    enviar: function(op) {
      op.criado = Date.now();
      var enfileirar = function() { return gravar(op).then(avisar).then(function() { return { enfileirado: true }; }); };
      return listar().then(function(ops) {
        // Com fila não-vazia o novo pedido entra atrás dela (ordem de envio).
        if (ops.length || navigator.onLine === false) return enfileirar();
        return post(op).then(function(body) { return { enviado: true, body: body }; }, function(e) {
          if (semRede(e)) return enfileirar();
          throw e;
        });
      });
    },
    listar: listar,
    processar: processar,
    aoMudar: function(f) { ouvintes.push(f); avisar(); },
    recusadas: function() { return recusadas.slice(); },
    limparRecusadas: function() { recusadas = []; salvarRecusadas(); }
  };

  // Cache local (catálogo, histórico, colaboradores): localStorage, tolerante a falha.
  window.GSSReqCache = {
    get: function(chave) {
      try { var v = JSON.parse(localStorage.getItem('gss_req_cache_' + chave)); return v ? v.dados : null; } catch (e) { return null; }
    },
    idade: function(chave) {
      try { var v = JSON.parse(localStorage.getItem('gss_req_cache_' + chave)); return v ? Date.now() - v.em : Infinity; } catch (e) { return Infinity; }
    },
    set: function(chave, dados) {
      try { localStorage.setItem('gss_req_cache_' + chave, JSON.stringify({ em: Date.now(), dados: dados })); } catch (e) {}
    }
  };

  window.addEventListener('online', processar);
  setInterval(function() { listar().then(function(ops) { if (ops.length) processar(); }); }, REENVIO_MS);
  processar();
})();
