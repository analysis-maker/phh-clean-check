/* PHH Clean Check service worker. Notifications only: no caching, so pages always load fresh. */
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(x){ d = { body: e.data ? e.data.text() : "" }; }
  var url = new URL(d.url || "./", self.registration.scope).href;
  e.waitUntil(self.registration.showNotification(d.title || "Clean Check", {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || undefined,
    data: { url: url }
  }));
});

self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(list){
    for(var i = 0; i < list.length; i++){
      var c = list[i];
      if(c.url.indexOf(self.registration.scope) === 0 && "navigate" in c){ return c.navigate(url).then(function(w){ return (w || c).focus(); }); }
    }
    return self.clients.openWindow(url);
  }));
});
