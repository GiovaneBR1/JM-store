// Login da JM Store (Firebase Authentication), usado pela loja e pela gestão.
// Admin = conta cujo UID existe na coleção "admins" do Firestore (cadastrada pelo console).
(function () {
  'use strict';

  var cfg = window.JM_FIREBASE || {};
  var enabled = !!cfg.apiKey && typeof window.firebase !== 'undefined';
  var state = { ready: !enabled, user: null, isAdmin: false };
  var listeners = [];
  var pending = null;
  var auth, fs;

  function $(sel, el) { return (el || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function emit() {
    renderAccount();
    listeners.forEach(function (fn) { fn(state); });
  }

  var ERRORS = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/missing-password': 'Digite a senha.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use "Entrar".',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Libere pop-ups e tente de novo.',
    'auth/unauthorized-domain': 'Este endereço do site ainda não foi autorizado no Firebase.'
  };
  function errMsg(e) { return ERRORS[e && e.code] || 'Não foi possível entrar. Tente de novo.'; }

  // ---------- janela de login ----------
  var dlg;
  function buildDialog() {
    dlg = document.createElement('dialog');
    dlg.className = 'auth';
    dlg.setAttribute('aria-labelledby', 'auth-title');
    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () { pending = null; });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }

  function openLogin(message, mode) {
    if (!dlg) buildDialog();
    mode = mode || 'login';
    var isNew = mode === 'signup';
    dlg.innerHTML = '<form class="auth__box" novalidate>' +
      '<button type="button" class="auth__x" data-auth="close" aria-label="Fechar">✕</button>' +
      '<h2 id="auth-title">' + (isNew ? 'Criar conta' : 'Entrar') + '</h2>' +
      (message ? '<p class="auth__msg">' + esc(message) + '</p>' : '') +
      '<button type="button" class="auth__google" data-auth="google">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12Z"/></svg>' +
        'Continuar com Google</button>' +
      '<p class="auth__or"><span>ou com e-mail</span></p>' +
      (isNew ? '<label class="auth__field"><span>Nome</span><input name="name" autocomplete="name" required></label>' : '') +
      '<label class="auth__field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>' +
      '<label class="auth__field"><span>Senha</span><input name="password" type="password" minlength="6" autocomplete="' + (isNew ? 'new-password' : 'current-password') + '" required>' +
        (isNew ? '<small>Mínimo de 6 caracteres.</small>' : '') + '</label>' +
      '<p class="auth__err" role="alert"></p>' +
      '<button class="auth__submit" type="submit">' + (isNew ? 'Criar conta' : 'Entrar') + '</button>' +
      (isNew ? '' : '<button type="button" class="auth__link" data-auth="reset">Esqueci minha senha</button>') +
      '<p class="auth__switch">' + (isNew ? 'Já tem conta? ' : 'Ainda não tem conta? ') +
        '<button type="button" class="auth__link" data-auth="' + (isNew ? 'login' : 'signup') + '">' + (isNew ? 'Entrar' : 'Criar conta') + '</button></p>' +
      '</form>';

    var form = $('form', dlg), err = $('.auth__err', dlg);
    var busy = function (on) { Array.prototype.forEach.call(form.querySelectorAll('button, input'), function (b) { b.disabled = on; }); };
    var fail = function (e) { busy(false); err.classList.remove('auth__err--ok'); err.textContent = typeof e === 'string' ? e : errMsg(e); };

    form.addEventListener('click', function (e) {
      var a = e.target.closest('[data-auth]');
      if (!a) return;
      var act = a.dataset.auth;
      if (act === 'close') dlg.close();
      else if (act === 'login' || act === 'signup') { var p = pending; openLogin(message, act); pending = p; }
      else if (act === 'google') {
        err.textContent = ''; busy(true);
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(fail);
      } else if (act === 'reset') {
        var email = form.email.value.trim();
        if (!email) { fail('Digite seu e-mail acima e clique de novo em "Esqueci minha senha".'); return; }
        busy(true);
        auth.sendPasswordResetEmail(email).then(function () {
          busy(false);
          err.textContent = 'Enviamos um link para ' + email + ' criar uma nova senha. Confira também o spam.';
          err.classList.add('auth__err--ok');
        }).catch(fail);
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      var email = form.email.value.trim(), pass = form.password.value;
      if (isNew && form.name.value.trim().length < 2) { fail('Digite seu nome.'); return; }
      busy(true);
      if (isNew) {
        var name = form.name.value.trim();
        auth.createUserWithEmailAndPassword(email, pass).then(function (cred) {
          return cred.user.updateProfile({ displayName: name }).then(function () {
            if (state.user) { state.user.name = name; renderAccount(); }
          });
        }).catch(fail);
      } else {
        auth.signInWithEmailAndPassword(email, pass).catch(fail);
      }
    });

    if (!dlg.open) dlg.showModal();
    var first = $('input', form);
    if (first) first.focus();
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- botão da conta no topo ----------
  function renderAccount() {
    var box = document.getElementById('account');
    if (!box) return;
    if (!enabled || !state.ready) { box.innerHTML = ''; return; }
    var onAdmin = document.body.hasAttribute('data-admin-page');
    if (!state.user) {
      box.innerHTML = '<button type="button" class="acct__btn" data-acct="login">Entrar</button>';
      return;
    }
    var first = (state.user.name || state.user.email || '').split(/[ @]/)[0];
    box.innerHTML = '<details class="acct"><summary class="acct__btn">Olá, ' + esc(first) + '</summary>' +
      '<div class="acct__menu"><p><b>' + esc(state.user.name || 'Minha conta') + '</b><small>' + esc(state.user.email || '') + '</small></p>' +
      (state.isAdmin && !onAdmin ? '<a href="admin.html">Painel de gestão</a>' : '') +
      '<button type="button" data-acct="logout">Sair</button></div></details>';
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-acct]');
    if (a) {
      if (a.dataset.acct === 'login') openLogin();
      else if (a.dataset.acct === 'logout') api.logout();
      return;
    }
    var open = document.querySelector('details.acct[open]');
    if (open && !open.contains(e.target)) open.removeAttribute('open');
  });

  // ---------- estado ----------
  if (enabled) {
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    fs = firebase.firestore();
    auth.languageCode = 'pt';
    auth.onAuthStateChanged(function (u) {
      if (!u) {
        state.user = null; state.isAdmin = false; state.ready = true;
        emit();
        return;
      }
      state.user = { uid: u.uid, name: u.displayName || '', email: u.email || '' };
      fs.collection('admins').doc(u.uid).get()
        .then(function (d) { return d.exists; }, function () { return false; })
        .then(function (isAdmin) {
          if (!state.user || state.user.uid !== u.uid) return;
          state.isAdmin = isAdmin; state.ready = true;
          if (dlg && dlg.open) {
            var then = pending; pending = null; dlg.close();
            toast('Olá, ' + (state.user.name || state.user.email) + '!');
            if (then) then();
          }
          emit();
        });
    });
  } else if (cfg.apiKey) {
    console.warn('JM Store: o Firebase não carregou; o login está indisponível.');
  }

  var api = window.JMAuth = {
    enabled: enabled,
    get user() { return state.user; },
    get isAdmin() { return state.isAdmin; },
    get ready() { return state.ready; },
    firestore: function () { return fs; },
    // Chama fn agora e a cada mudança de login (depois que o estado inicial é conhecido).
    onChange: function (fn) { listeners.push(fn); if (state.ready) fn(state); },
    // Executa then() se a pessoa estiver logada; senão abre o login e executa depois de entrar.
    require: function (message, then) {
      if (!enabled || state.user) { if (then) then(); return true; }
      openLogin(message);
      pending = then || null;
      return false;
    },
    login: function (message) { if (enabled) openLogin(message); },
    logout: function () {
      if (!enabled) return;
      auth.signOut().then(function () { toast('Você saiu da sua conta.'); });
    }
  };

  renderAccount();
})();
