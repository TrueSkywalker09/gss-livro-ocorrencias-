// ═══════════════════════════════════════════════════════════════════════════════
// GSS — login único do app do colaborador (gss-login.js)
// Fonte única em dist/shared; os deploys copiam para livro-remoto e
// gss-requisicoes. Login = empresa (01 Segurança / 02 Serviços) + RE + senha.
// O mesmo RE existe nas duas empresas, por isso a escolha é obrigatória; o
// aparelho lembra a última. Durante a transição dá para entrar com o login
// antigo (usuário).
// Marcação esperada na tela de login: #lg-emp (botões data-filial),
// #lg-lbl-usuario, #login-input, #lg-legado.
//   GSSLogin.corpo(senha) → { body } pronto para o auth-form, ou { erro }
//   GSSLogin.lembrarUsuario(user) / usuarioLembrado() / esquecer()
//     → sessão compartilhada entre Livro e Requisições no app
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var CHAVE_EMPRESA = 'gss_empresa';
  var CHAVE_USUARIO = 'gss_app_usuario';
  var ler = function(k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var gravar = function(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };

  var G = window.GSSLogin = {
    modo: 're',
    filial: ler(CHAVE_EMPRESA) || '',

    escolher: function(filial) {
      G.filial = filial;
      gravar(CHAVE_EMPRESA, filial);
      document.querySelectorAll('#lg-emp [data-filial]').forEach(function(b) {
        var ativo = b.getAttribute('data-filial') === filial;
        b.classList.toggle('ativo', ativo);
        b.setAttribute('aria-checked', ativo ? 'true' : 'false');
      });
      var inp = document.getElementById('login-input');
      if (inp && G.modo === 're') inp.focus();
    },

    alternar: function() {
      G.modo = G.modo === 're' ? 'login' : 're';
      var re = G.modo === 're';
      var emp = document.getElementById('lg-emp'), lbl = document.getElementById('lg-lbl-usuario');
      var empLbl = document.getElementById('lg-lbl-emp'), inp = document.getElementById('login-input');
      var lnk = document.getElementById('lg-legado');
      if (emp) emp.style.display = re ? '' : 'none';
      if (empLbl) empLbl.style.display = re ? '' : 'none';
      if (lbl) lbl.textContent = re ? 'RE (matrícula)' : 'Usuário (login antigo)';
      if (inp) { inp.value = ''; inp.placeholder = re ? 'Ex.: 123456' : 'nome.sobrenome'; inp.setAttribute('inputmode', re ? 'numeric' : 'text'); inp.focus(); }
      if (lnk) lnk.textContent = re ? 'Entrar com o login antigo (usuário)' : 'Entrar com empresa e RE';
    },

    corpo: function(senha) {
      var valor = ((document.getElementById('login-input') || {}).value || '').trim();
      if (G.modo === 're') {
        if (!G.filial) return { erro: 'Escolha a empresa: GSS Segurança ou GSS Serviços.' };
        if (!valor) return { erro: 'Informe seu RE (matrícula).' };
        if (!senha) return { erro: 'Informe a senha.' };
        return { body: { action: 'login', filial: G.filial, re: valor, senha: senha } };
      }
      if (!valor) return { erro: 'Informe o usuário.' };
      if (!senha) return { erro: 'Informe a senha.' };
      return { body: { action: 'login', login: valor, senha: senha } };
    },

    lembrarUsuario: function(user) { gravar(CHAVE_USUARIO, user ? JSON.stringify(user) : null); },
    usuarioLembrado: function() { try { return JSON.parse(ler(CHAVE_USUARIO)); } catch (e) { return null; } },
    esquecer: function() { gravar(CHAVE_USUARIO, null); },

    tem: function(user, modulo) { return !!(user && Array.isArray(user.modulos) && user.modulos.indexOf(modulo) >= 0); }
  };

  document.addEventListener('DOMContentLoaded', function() {
    if (G.filial) G.escolher(G.filial);
  });
})();
