// ═══════════════════════════════════════════════════════════════════════════════
// GSS — Ponte com o app Android "GSS Ronda" (app-ronda/, Capacitor)
// No navegador este arquivo não faz nada. Dentro do app expõe window.GSSNativo:
//   gpsIniciar/gpsParar — GPS que continua com a tela apagada (serviço em
//                         primeiro plano do plugin background-geolocation)
//   status, abrirAjustesBateria, wifiScan, pressao — plugin próprio GssNativo
// e mantém a página atualizada: a página vem embutida no APK (abre sem
// internet) e, com internet, baixa a versão nova (app-bundle.json, publicado
// pelo deploy-livro.ps1), aplicada só fora de uma ronda.
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;

  var URL_PACOTE = 'https://gss-livro-ocorrencias.pages.dev/app-bundle.json';
  var PENDENTE_KEY = 'gss_app_bundle_pendente';
  var VERIFICAR_MS = 30 * 60 * 1000;

  function chamar(plugin, metodo, opcoes) {
    if (!cap.isPluginAvailable(plugin)) return Promise.reject(new Error(plugin + ' indisponível'));
    return cap.nativePromise(plugin, metodo, opcoes || {});
  }

  window.GSSNativo = {
    ativo: true,
    status: function() { return chamar('GssNativo', 'status'); },
    abrirAjustesBateria: function() { return chamar('GssNativo', 'abrirAjustesBateria'); },
    wifiScan: function() { return chamar('GssNativo', 'wifiScan'); },
    pressao: function() { return chamar('GssNativo', 'pressao'); },
    horaGps: function() { return chamar('GssNativo', 'horaGps'); },

    // Mesmo formato do navigator.geolocation (coords/timestamp), mais:
    //   timestamp = hora do fix do GPS (satélite), não a do relógio do aparelho
    //   simulado  = posição vinda de app de "GPS falso"
    // Devolve o id do watcher (para gpsParar).
    gpsIniciar: function(aoPosicionar, aoFalhar) {
      if (!cap.isPluginAvailable('BackgroundGeolocation')) return null;
      return cap.nativeCallback('BackgroundGeolocation', 'addWatcher', {
        backgroundTitle: 'Ronda em andamento',
        backgroundMessage: 'O GSS Ronda está registrando o trajeto.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0
      }, function(loc, erro) {
        if (erro) {
          aoFalhar({ code: erro.code === 'NOT_AUTHORIZED' ? 1 : 2, message: erro.message || String(erro) });
          return;
        }
        if (!loc) return;
        aoPosicionar({
          coords: { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, altitude: loc.altitude },
          timestamp: loc.time,
          simulado: !!loc.simulated
        });
      });
    },
    gpsParar: function(id) {
      if (!id) return Promise.resolve();
      return chamar('BackgroundGeolocation', 'removeWatcher', { id: id }).catch(function() {});
    }
  };

  // ─── ATUALIZAÇÃO DA PÁGINA ─────────────────────────────────────────────────
  // Nunca troca a página no meio de uma ronda: a versão baixada fica pendente
  // e é aplicada ao abrir o app (ou voltar a ele) sem ronda em andamento.
  function emRonda() {
    if (window.GSSRonda && window.GSSRonda.emAndamento && window.GSSRonda.emAndamento()) return true;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf('gss_ronda_ctx_') === 0) {
          var ctx = JSON.parse(localStorage.getItem(k));
          if (ctx && ctx.ronda) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function aplicarPendente() {
    var id = null;
    try { id = localStorage.getItem(PENDENTE_KEY); } catch (e) {}
    if (!id || emRonda()) return false;
    try { localStorage.removeItem(PENDENTE_KEY); } catch (e) {}
    chamar('CapacitorUpdater', 'set', { id: id }).catch(function() {}); // recarrega na versão nova
    return true;
  }

  function verificarAtualizacao() {
    if (navigator.onLine === false) return;
    Promise.all([
      fetch('bundle-versao.json').then(function(r) { return r.json(); }).catch(function() { return {}; }),
      fetch(URL_PACOTE + '?t=' + Date.now(), { cache: 'no-store' }).then(function(r) { return r.json(); })
    ]).then(function(res) {
      var local = res[0].versao, remoto = res[1];
      if (!remoto || !remoto.version || remoto.version === local) return;
      return chamar('CapacitorUpdater', 'list').then(function(l) {
        var ja = ((l && l.bundles) || []).filter(function(b) { return b.version === remoto.version && b.status === 'success'; })[0];
        return ja || chamar('CapacitorUpdater', 'download', { url: remoto.url, version: remoto.version });
      }).then(function(b) {
        try { localStorage.setItem(PENDENTE_KEY, b.id); } catch (e) {}
        aplicarPendente();
      });
    }).catch(function() { /* sem internet ou servidor fora: tenta depois */ });
  }

  // Confirma que esta versão abriu bem; sem isso o updater volta para a anterior.
  chamar('CapacitorUpdater', 'notifyAppReady').catch(function() {});
  if (!aplicarPendente()) setTimeout(verificarAtualizacao, 5000);
  setInterval(verificarAtualizacao, VERIFICAR_MS);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') aplicarPendente();
  });
})();
