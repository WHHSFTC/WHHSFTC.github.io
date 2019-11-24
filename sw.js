const cacheName = 'v1'

self.addEventListener('install', event => {
    event.waitUntil(
	caches.open(cacheName).then(cache => {
	    return cache.addAll([
		'./index.html',
		'./bundle.css',
		'./bundle.js'
	    ])
	}).then(() => {
	    return self.skipWaiting()  
	})
    )
})

self.addEventListener('activate', event => {
    console.log('Service worker activated')
    return self.clients.claim()
})

self.addEventListener('fetch', event => {
    console.log(event.request.url)
    event.respondWith(
	caches.match(event.request)
    )
})

self.addEventListener('activate', event => {
    event.waitUntil(
	caches.keys().then(keyList => {
	    return Promise.all(keyList.map(key => {
		if (key !== cacheName) {
		    return caches.delete(key)
		}
	    }))
	})
    )
})
