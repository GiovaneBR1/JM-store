// Recebe as notificações de pedido da gestão mesmo com o site fechado.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
importScripts('js/firebase-config.js');

firebase.initializeApp(self.JM_FIREBASE);
firebase.messaging().onBackgroundMessage(function (payload) {
  var d = payload.data || {};
  return self.registration.showNotification(d.title || 'JM Store', {
    body: d.body || '', icon: 'img/icon-192.png', badge: 'img/icon-192.png', tag: d.title, data: { url: d.url || 'admin.html#/pedidos' }
  });
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = e.notification.data && e.notification.data.url;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    var open = list.find(function (c) { return c.url.indexOf('admin.html') !== -1; });
    if (open) { open.navigate(url); return open.focus(); }
    return clients.openWindow(url);
  }));
});
