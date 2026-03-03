import {
  firebaseReady,
  subscribeSettings,
  subscribeCollection
} from './firebase-data.js';

if (window.location.pathname.includes('/admin/')) {
  // Do not run public sync on admin pages.
} else if (firebaseReady) {
  const kinds = [
    'services',
    'trusted',
    'portfolio',
    'why',
    'process',
    'testimonials',
    'blog',
    'faq'
  ];

  let refreshTimer = null;
  const refresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (typeof window.identisiteRefreshCms === 'function') {
        window.identisiteRefreshCms();
      }
    }, 50);
  };

  subscribeSettings((payload) => {
    localStorage.setItem('identisite_settings', JSON.stringify(payload || {}));
    refresh();
  });

  kinds.forEach((kind) => {
    subscribeCollection(kind, (items) => {
      localStorage.setItem(`identisite_${kind}`, JSON.stringify(items || []));
      refresh();
    });
  });
}
