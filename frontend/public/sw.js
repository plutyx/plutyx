const VERSION='c360-shell-v56'
const SHELL=["/","/manifest.webmanifest"]
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))})
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION&&key.startsWith('c360-shell-')).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))})
function sameOrigin(url){return url.origin===self.location.origin}
function isApi(url){return url.pathname.startsWith('/api/')||url.pathname.startsWith('/functions/')}
self.addEventListener('fetch',event=>{
 const req=event.request
 if(req.method!=='GET')return
 const url=new URL(req.url)
 if(!sameOrigin(url)||isApi(url))return
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(response=>{const copy=response.clone();caches.open(VERSION).then(cache=>cache.put('/',copy));return response}).catch(async()=>await caches.match('/')||new Response('Cozinha 360 indisponível sem cache local.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})))
  return
 }
 event.respondWith(caches.match(req).then(cached=>{
  const network=fetch(req).then(response=>{if(response.ok&&response.type==='basic'){const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(req,copy))}return response}).catch(()=>cached)
  return cached||network
 }))
})
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()})
