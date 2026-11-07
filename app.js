const topbar = document.getElementById('topbar');
const name = document.querySelector('.name');

// A barra do topo entra assim que o nome sai da tela.
new IntersectionObserver(
  ([entry]) => topbar.classList.toggle('is-visible', !entry.isIntersecting),
  { rootMargin: '-8px 0px 0px 0px' }
).observe(name);

// Janela com todos os sistemas: abre no botão, fecha no X, no Esc ou tocando fora.
const janelaApps = document.getElementById('apps-janela');
if (janelaApps && typeof janelaApps.showModal === 'function') {
  document.querySelector('[data-abrir-apps]').addEventListener('click', () => janelaApps.showModal());
  janelaApps.querySelector('[data-fechar-apps]').addEventListener('click', () => janelaApps.close());
  janelaApps.addEventListener('click', (e) => { if (e.target === janelaApps) janelaApps.close(); });
}

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
