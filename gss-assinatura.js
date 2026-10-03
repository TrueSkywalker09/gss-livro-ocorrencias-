// ═══════════════════════════════════════════════════════════════════════════════
// GSS — assinatura em tela cheia (padrão único das páginas externas)
// FONTE ÚNICA: dist/shared/gss-assinatura.js — os deploys copiam para cada site
// (Requisições, Livro de Ocorrências, Visto). Não edite as cópias.
//
// A caixa da página vira só uma PRÉVIA ("Toque aqui para assinar" + linha). Ao
// tocar, abre a assinatura em tela cheia, NA HORIZONTAL (celular em pé: a área
// gira 90° e a pessoa vira o aparelho; Android em tela cheia: gira de verdade),
// com linha de apoio — a linha não entra na imagem. A imagem é recortada no traço.
//
//   var a = GSSAssinatura.ligar(canvas, {
//     titulo: 'Assinatura de Fulano',   // cabeçalho da tela cheia
//     fundo: '#fff',                    // fundo da imagem (padrão: transparente)
//     formato: 'png' | 'jpeg',          // padrão png (jpeg exige fundo)
//     inicial: dataUrl,                 // assinatura já feita (mostra na prévia)
//     aoMudar: function(url) {}         // chamado ao concluir (url) e ao limpar (null)
//   });
//   a.tem()  a.url()  a.limpar()  a.abrir()
// Estilos: .sigf-* em gss-web.css.
// ═══════════════════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var IC_LIMPAR = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';
  var IC_OK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  function esc(s) { return String(s || '').replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Abre a tela cheia. Resolve com a imagem (dataURL) ou null se cancelar.
  function abrir(opts) {
    opts = opts || {};
    return new Promise(function(resolve) {
      var antigo = document.getElementById('sig-full');
      if (antigo) antigo.remove();
      var ov = document.createElement('div');
      ov.id = 'sig-full';
      ov.innerHTML = '<div class="sigf-box">' +
        '<div class="sigf-topo"><span class="sigf-tit">' + esc(opts.titulo || 'Assine sobre a linha') + '</span>' +
        '<button type="button" class="sigf-btn" data-a="limpar">' + IC_LIMPAR + ' Limpar</button>' +
        '<button type="button" class="sigf-btn" data-a="cancelar">Cancelar</button>' +
        '<button type="button" class="sigf-btn sigf-ok" data-a="ok">' + IC_OK + ' Concluir</button></div>' +
        '<div class="sigf-area"><canvas></canvas><div class="sigf-linha"><span class="sigf-x">✕</span></div><div class="sigf-rot">Assine sobre a linha</div></div>' +
        '<div class="sigf-msg"></div></div>';
      document.body.appendChild(ov);
      var box = ov.querySelector('.sigf-box'), area = ov.querySelector('.sigf-area'), cv = ov.querySelector('canvas'), msg = ov.querySelector('.sigf-msg');
      var ctx = cv.getContext('2d'), girado = false, riscou = false, desenhando = false;
      var toque = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

      function montar() {
        if (riscou) return; // não apaga uma assinatura em andamento
        var vw = window.innerWidth, vh = window.innerHeight;
        girado = vh > vw;
        box.style.width = (girado ? vh : vw) + 'px';
        box.style.height = (girado ? vw : vh) + 'px';
        box.style.transform = girado ? 'translateX(' + vw + 'px) rotate(90deg)' : 'none';
        var dpr = window.devicePixelRatio || 1;
        cv.width = area.offsetWidth * dpr; cv.height = area.offsetHeight * dpr;
        cv.style.width = area.offsetWidth + 'px'; cv.style.height = area.offsetHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a';
      }
      montar();
      window.addEventListener('resize', montar);
      if (toque) {
        try {
          var fs = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
          if (fs && fs.then) fs.then(function() { return screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null; })
            .then(function() { setTimeout(montar, 250); }).catch(function() {});
        } catch (e) {}
      }

      function ponto(e) {
        var r = cv.getBoundingClientRect();
        return girado ? { x: e.clientY - r.top, y: r.right - e.clientX } : { x: e.clientX - r.left, y: e.clientY - r.top };
      }
      cv.addEventListener('pointerdown', function(e) {
        e.preventDefault(); desenhando = true; riscou = true; msg.textContent = '';
        try { cv.setPointerCapture(e.pointerId); } catch (x) {}
        var p = ponto(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
      });
      cv.addEventListener('pointermove', function(e) {
        if (!desenhando) return;
        e.preventDefault();
        var p = ponto(e); ctx.lineTo(p.x, p.y); ctx.stroke();
      });
      function soltar() { desenhando = false; }
      cv.addEventListener('pointerup', soltar);
      cv.addEventListener('pointercancel', soltar);

      function fechar(url) {
        window.removeEventListener('resize', montar);
        document.removeEventListener('keydown', teclas);
        ov.remove();
        try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
        try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function() {}); } catch (e) {}
        resolve(url);
      }
      function teclas(e) { if (e.key === 'Escape') fechar(null); }
      document.addEventListener('keydown', teclas);

      // Recorta no traço (com margem): preenche melhor onde a assinatura for usada.
      function recortada() {
        var W = cv.width, H = cv.height, d = ctx.getImageData(0, 0, W, H).data;
        var x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (var y = 0; y < H; y += 2) for (var x = 0; x < W; x += 2) {
          if (d[(y * W + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        if (x1 < 0) return null;
        var m = Math.round(14 * (window.devicePixelRatio || 1));
        x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
        var out = document.createElement('canvas');
        out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
        var o = out.getContext('2d');
        var fundo = opts.fundo || (opts.formato === 'jpeg' ? '#fff' : null);
        if (fundo) { o.fillStyle = fundo; o.fillRect(0, 0, out.width, out.height); }
        o.drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
        return opts.formato === 'jpeg' ? out.toDataURL('image/jpeg', opts.qualidade || 0.85) : out.toDataURL('image/png');
      }

      ov.querySelector('.sigf-topo').addEventListener('click', function(e) {
        var b = e.target.closest('[data-a]');
        if (!b) return;
        var a = b.getAttribute('data-a');
        if (a === 'limpar') { riscou = false; montar(); return; }
        if (a === 'cancelar') { fechar(null); return; }
        var url = riscou ? recortada() : null;
        if (!url) { msg.textContent = 'Assine sobre a linha antes de concluir.'; return; }
        fechar(url);
      });
    });
  }

  // Liga uma caixa (canvas) da página: vira prévia e abre a tela cheia ao tocar.
  function ligar(canvas, opts) {
    opts = opts || {};
    var atual = opts.inicial || null;
    var ctx = canvas.getContext('2d');
    // A caixa pode estar numa tela ainda escondida (tamanho zero): dimensiona
    // quando ficar visível, para a prévia sair nítida e no tamanho certo.
    var tentativas = 0;
    function dimensionar() {
      var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      if (!r.width) { if (tentativas++ < 120) requestAnimationFrame(dimensionar); return; }
      if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
      previa();
    }
    canvas.style.cursor = 'pointer';
    canvas.style.touchAction = 'manipulation';
    // tira os handlers de desenho antigos da página, se houver
    canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointerleave = null;
    canvas.onmousedown = canvas.onmousemove = canvas.onmouseup = canvas.onmouseleave = null;
    canvas.ontouchstart = canvas.ontouchmove = canvas.ontouchend = null;

    function previa() {
      var W = canvas.width, H = canvas.height, k = W / (canvas.getBoundingClientRect().width || W);
      ctx.clearRect(0, 0, W, H);
      if (opts.fundo) { ctx.fillStyle = opts.fundo; ctx.fillRect(0, 0, W, H); }
      if (atual) {
        var img = new Image();
        img.onload = function() {
          var e = Math.min((W * 0.9) / img.width, (H * 0.8) / img.height);
          var w = img.width * e, h = img.height * e;
          ctx.clearRect(0, 0, W, H);
          if (opts.fundo) { ctx.fillStyle = opts.fundo; ctx.fillRect(0, 0, W, H); }
          ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        };
        img.src = atual;
        return;
      }
      var yL = H * 0.68;
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5 * k;
      ctx.setLineDash([6 * k, 5 * k]);
      ctx.beginPath(); ctx.moveTo(W * 0.08, yL); ctx.lineTo(W * 0.92, yL); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#94a3b8'; ctx.font = (18 * k) + 'px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('✕', W * 0.08, yL - 8 * k);
      ctx.fillStyle = '#64748b'; ctx.font = '600 ' + (15 * k) + 'px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(opts.texto || 'Toque aqui para assinar', W / 2, H * 0.4);
      ctx.textAlign = 'left';
    }

    var ctrl = {
      tem: function() { return !!atual; },
      url: function() { return atual; },
      limpar: function() { atual = null; previa(); if (opts.aoMudar) opts.aoMudar(null); },
      abrir: function() {
        return abrir(opts).then(function(url) {
          if (url) { atual = url; previa(); if (opts.aoMudar) opts.aoMudar(url); }
          return url;
        });
      }
    };
    canvas.onclick = function() { ctrl.abrir(); };
    dimensionar();
    return ctrl;
  }

  window.GSSAssinatura = { ligar: ligar, abrir: abrir };
})();
