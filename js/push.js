// Notificações de pedido no aparelho da gestão (Firebase Cloud Messaging).
// O aparelho guarda um "token" em adminTokens; o servidor manda o aviso para todos os tokens.
(function () {
  'use strict';
  var KEY = 'jm-push-token';
  var cfg = window.JM_FIREBASE || {};
  function stored() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function remember(t) { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) { /* ignora */ } }
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function supported() {
    if (!('serviceWorker' in navigator) || !('Notification' in window) || !window.firebase || !firebase.messaging) return Promise.resolve(false);
    try { return Promise.resolve(firebase.messaging.isSupported()).catch(function () { return false; }); } catch (e) { return Promise.resolve(false); }
  }
  // Permissão atual ("granted", "denied" ou "default"), pela API de permissões quando existe.
  function permission() {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve(Notification.permission);
    return navigator.permissions.query({ name: 'notifications' })
      .then(function (s) { return s.state === 'prompt' ? 'default' : s.state; }, function () { return Notification.permission; });
  }
  // Situação mostrada na gestão.
  function status() {
    return supported().then(function (ok) {
      if (!cfg.vapidKey) return 'config';
      if (isIOS && !standalone) return 'ios-install';
      if (!ok) return 'unsupported';
      return permission().then(function (perm) {
        if (perm === 'denied') return 'denied';
        return perm === 'granted' && stored() ? 'on' : 'off';
      });
    });
  }
  function enable(uid) {
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('denied');
      return navigator.serviceWorker.register('firebase-messaging-sw.js');
    }).then(function (reg) {
      return firebase.messaging().getToken({ vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
    }).then(function (token) {
      if (!token) throw new Error('token');
      remember(token);
      return firebase.firestore().collection('adminTokens').doc(token).set({ uid: uid, aparelho: navigator.userAgent.slice(0, 140), criadoEm: Date.now() });
    });
  }
  function disable() {
    var t = stored();
    remember('');
    return Promise.all([
      t ? firebase.firestore().collection('adminTokens').doc(t).delete().catch(function () {}) : null,
      firebase.messaging().deleteToken().catch(function () {})
    ]);
  }
  window.JMPush = { status: status, enable: enable, disable: disable };
})();
