/* PHH Clean Check service worker. Notifications only: no caching, so pages always load fresh.
   Tapping a notification opens its page. iPhone Home Screen apps can ignore the address when they reopen, so the address
   is also left in a small cache ("pending-nav") and sent to any open window; the pages pick it up and go there. */
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(x){ d = { body: e.data ? e.data.text() : "" }; }
  var url = new URL(d.url || "./", self.registration.scope).href;
  e.waitUntil(self.registration.showNotification(d.title || "Professional Holiday Homes", {
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
  e.waitUntil(
    caches.open("phh-nav").then(function(c){ return c.put("pending-nav", new Response(JSON.stringify({ url: url, at: Date.now() }))); }).catch(function(){})
      .then(function(){ return self.clients.matchAll({ type: "window", includeUncontrolled: true }); })
      .then(function(list){
        for(var i = 0; i < list.length; i++){
          var c = list[i];
          if(c.url.indexOf(self.registration.scope) === 0){
            try{ c.postMessage({ phhNav: url }); }catch(x){}
            return c.focus().catch(function(){});
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
