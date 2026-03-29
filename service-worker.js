// Enhanced Progressive Web App Service Worker for Praise & Worship Songs
const CACHE_NAME = 'pw-ocean-v2.6-SMART-FALLBACK';
const STATIC_CACHE = 'pw-static-v2.6-SMART-FALLBACK';
const API_CACHE = 'pw-api-v2.6-SMART-FALLBACK';

// Resources to cache for offline functionality (using relative paths for cross-deployment compatibility)
const STATIC_RESOURCES = [
  './',
  './index.html',
  './styles.css', 
  './main1.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Also cache with absolute paths for broader compatibility
  '/',
  '/index.html',
  '/styles.css',
  '/main1.js', 
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/songs',
  '/api/global-setlists',
  '/api/recommendation-weights'
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing Ocean Theme PWA v2.1');
  
  // Skip caching in development (localhost)
  const isLocalhost = self.location.hostname === 'localhost' || 
                     self.location.hostname === '127.0.0.1' ||
                     self.location.hostname === '';
  
  if (isLocalhost) {
    console.log('Service Worker: Skipping caching for localhost development');
    self.skipWaiting();
    return;
  }
  
  event.waitUntil(
    Promise.all([
      // Cache static resources
      caches.open(STATIC_CACHE).then(cache => {
        console.log('Service Worker: Caching static resources');
        return cache.addAll(STATIC_RESOURCES).catch(err => {
          console.warn('Service Worker: Some static resources failed to cache', err);
        });
      }),
      
      // Cache API endpoints
      caches.open(API_CACHE).then(cache => {
        console.log('Service Worker: Preparing API cache');
        return Promise.resolve(); // API will be cached on first request
      })
    ]).then(() => {
      console.log('Service Worker: Installation complete');
      return self.skipWaiting(); // Activate immediately
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating Ocean Theme PWA');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== API_CACHE && 
                cacheName !== CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Take control of all clients
      self.clients.claim()
    ]).then(() => {
      console.log('Service Worker: Activation complete - PWA ready');
    })
  );
});

// Fetch event - implement caching strategies with cross-origin support
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Handle cross-origin API requests to both Render and Vercel backends
  // IMPORTANT: Let the main thread handle fallback logic, SW just passes through
  const isRenderBackend = url.hostname === 'praiseandworship.onrender.com';
  const isVercelBackend = url.hostname === 'praiseand-worship.vercel.app' || url.hostname.endsWith('.vercel.app');
  const isLocalApi = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.pathname.startsWith('/api/');
  
  if (isRenderBackend || isVercelBackend) {
    // For backend APIs, use simple pass-through strategy to allow main thread fallback
    event.respondWith(simplePassThroughStrategy(request));
    return;
  }
  
  // Handle localhost API requests with regular network first strategy
  if (isLocalApi) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Prefer fresh HTML so startup scripts do not run from stale cache.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirstStrategy(request));
    return;
  }
  
  // Handle static resources with Cache First strategy
  if (STATIC_RESOURCES.some(resource => url.pathname === resource || url.pathname.endsWith(resource))) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }
  
  // Handle other requests with Stale While Revalidate
  event.respondWith(staleWhileRevalidateStrategy(request));
});

// Cache First Strategy - for static resources
async function cacheFirstStrategy(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Return cached version immediately
      console.log('Service Worker: Serving from cache:', request.url);
      return cachedResponse;
    }
    
    // Fetch from network if not in cache
    console.log('Service Worker: Fetching from network:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      const responseClone = networkResponse.clone();
      cache.put(request, responseClone);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: Cache First strategy failed:', error);
    
    // Return offline fallback if available
    if (request.destination === 'document') {
      const cache = await caches.open(STATIC_CACHE);
      return await cache.match('/index.html') || new Response('App offline', { status: 503 });
    }
    
    return new Response('Resource unavailable offline', { status: 503 });
  }
}

// Simple Pass-Through Strategy - for backend APIs (allows main thread to handle fallback)
async function simplePassThroughStrategy(request) {
  try {
    console.log('Service Worker: Pass-through for API:', request.url);
    
    // Pass through to network using the original request options.
    const networkResponse = await fetch(request);
    
    // Only cache successful GET requests
    if (networkResponse.ok && request.method === 'GET' && 
        (request.url.includes('/api/songs') || 
         request.url.includes('/api/global-setlists') ||
         request.url.includes('/api/recommendation-weights'))) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
      console.log('Service Worker: Cached API response:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('Service Worker: Network failed, checking cache:', error);
    
    // Only use cache as absolute last resort
    const cache = await caches.open(API_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Service Worker: Serving from cache (offline):', request.url);
      return cachedResponse;
    }
    
    // Return a structured response instead of throwing to avoid unhandled fetch warnings.
    return new Response(JSON.stringify({
      error: 'Network request failed',
      offline: true,
      requestUrl: request.url,
      message: 'Unable to reach backend from service worker pass-through.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Cross-Origin API Strategy - for Render backend requests (DEPRECATED - using simplePassThroughStrategy)
async function crossOriginApiStrategy(request) {
  try {
    console.log('Service Worker: Cross-origin API request to:', request.url);
    
    // Don't add custom CORS headers - let the main thread handle retries
    const networkResponse = await fetch(request, {
      mode: 'cors',
      credentials: 'include'
    });
    
    if (networkResponse.ok) {
      // Cache successful API responses for offline access
      const cache = await caches.open(API_CACHE);
      const responseClone = networkResponse.clone();
      
      // Only cache GET requests for data endpoints
      if (request.method === 'GET' && 
          (request.url.includes('/api/songs') || 
           request.url.includes('/api/global-setlists') ||
           request.url.includes('/api/recommendation-weights'))) {
        cache.put(request, responseClone);
        console.log('Service Worker: Cached API response:', request.url);
      }
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('Service Worker: Cross-origin API failed, trying cache:', error);
    
    // Fallback to cache if network fails
    const cache = await caches.open(API_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Service Worker: Serving cross-origin API from cache:', request.url);
      // Add offline indicator to cached responses
      const modifiedResponse = new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: {
          ...Object.fromEntries(cachedResponse.headers.entries()),
          'X-Served-From': 'cache',
          'X-Offline-Mode': 'true'
        }
      });
      return modifiedResponse;
    }
    
    // Return structured error response for API failures
    return new Response(JSON.stringify({ 
      error: 'Backend unavailable and no cached data',
      offline: true,
      message: 'Please check your internet connection. The app will work when the backend is available.',
      backend: 'https://praiseandworship.onrender.com'
    }), {
      status: 503,
      headers: { 
        'Content-Type': 'application/json',
        'X-Error-Type': 'cross-origin-api-failure'
      }
    });
  }
}

// Network First Strategy - for same-origin API calls
async function networkFirstStrategy(request) {
  try {
    console.log('Service Worker: Network first for API:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful API responses
      const cache = await caches.open(API_CACHE);
      const responseClone = networkResponse.clone();
      cache.put(request, responseClone);
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('Service Worker: Network failed, trying cache:', error);
    
    // Fallback to cache if network fails
    const cache = await caches.open(API_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Service Worker: Serving API from cache:', request.url);
      return cachedResponse;
    }
    
    // Return error response if no cache available
    return new Response(JSON.stringify({ 
      error: 'Network unavailable and no cached data',
      offline: true 
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Stale While Revalidate Strategy - for other resources
async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Always attempt network fetch to update cache in background
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(error => {
    console.warn('Service Worker: Background fetch failed:', error);
    return cachedResponse;
  });
  
  // Return cached version immediately if available, otherwise wait for network
  return cachedResponse || await fetchPromise;
}

// Handle PWA installation prompts
self.addEventListener('beforeinstallprompt', (event) => {
  console.log('Service Worker: PWA install prompt available');
  event.preventDefault();
  
  // Notify the main thread that install is available
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'INSTALL_PROMPT_AVAILABLE',
        data: { canInstall: true }
      });
    });
  });
});

// Handle app installation
self.addEventListener('appinstalled', (event) => {
  console.log('Service Worker: PWA has been installed successfully');
  
  // Notify the main thread of successful installation
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'APP_INSTALLED',
        data: { installed: true }
      });
    });
  });
});

// Handle push notifications (future enhancement)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
      data: data.data || {},
      actions: data.actions || []
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Praise & Worship', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Open new window if no existing window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});