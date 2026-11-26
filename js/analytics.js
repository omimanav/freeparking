(() => {
  const { origin, pathname } = window.location;
  if (origin !== 'https://omimanav.com' || !pathname.startsWith('/freeparking/')) return;

  const measurementId = 'G-HNFWP0JMTM';
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  gtag('js', new Date());
  gtag('config', measurementId);

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(tag);
})();
