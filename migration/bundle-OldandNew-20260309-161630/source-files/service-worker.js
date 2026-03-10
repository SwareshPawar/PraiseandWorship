self.addEventListener('install', event => {
    self.skipWaiting();
});
self.addEventListener('fetch', event => {
    // You can add caching logic here if desired
});