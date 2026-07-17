const topbar = document.getElementById('topbar');
const name = document.querySelector('.name');

// A barra do topo entra assim que o nome sai da tela.
new IntersectionObserver(
  ([entry]) => topbar.classList.toggle('is-visible', !entry.isIntersecting),
  { rootMargin: '-8px 0px 0px 0px' }
).observe(name);

// Facade do vídeo: o player do YouTube só entra ao clicar na capa.
document.querySelectorAll('.video').forEach((btn) => {
  btn.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${btn.dataset.yt}?autoplay=1&rel=0`;
    iframe.title = btn.getAttribute('aria-label');
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    btn.replaceWith(iframe);
  }, { once: true });
});
