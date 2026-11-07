/* Página de vendas (só tema claro): "ver mais" da lista no celular, "ver mais perguntas" com N calculado. */
(() => {
  // lista cortada no celular (4 linhas) com botão "Ver mais N"
  document.querySelectorAll('[data-ver-mais]').forEach((btn) => {
    const lista = document.querySelector(btn.dataset.verMais);
    if (!lista) return;
    const mq = matchMedia('(max-width: 39.99rem)');
    const ajusta = () => {
      const resto = [...lista.children].slice(4);
      btn.hidden = !mq.matches || !resto.length;
      btn.textContent = lista.classList.contains('aberta') ? 'Ver menos' : `Ver mais ${resto.length}`;
    };
    btn.addEventListener('click', () => {
      const abrir = !lista.classList.contains('aberta');
      lista.classList.toggle('aberta', abrir);
      [...lista.children].slice(4).forEach((x) => x.classList.toggle('mostrar', abrir));
      btn.setAttribute('aria-expanded', abrir); ajusta();
    });
    mq.addEventListener('change', ajusta); ajusta();
  });

  // FAQ: perguntas extras atrás de um botão com a conta real
  const mais = document.querySelector('[data-faq-mais]');
  if (mais) {
    const extras = document.querySelectorAll('.faq .extra');
    const atualiza = (aberto) => { mais.textContent = aberto ? 'Ver menos perguntas' : `Ver mais perguntas (+${extras.length})`; mais.setAttribute('aria-expanded', aberto); };
    atualiza(false);
    mais.addEventListener('click', () => { const a = !extras[0].classList.contains('mostrar'); extras.forEach((x) => x.classList.toggle('mostrar', a)); atualiza(a); });
  }

  // vídeo da hero: começa tocando, mudo e em laço (nunca pausado); só para fora da tela e com "menos movimento"
  const reduz = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.hero-midia video').forEach((v) => {
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
    if (reduz.matches) { v.removeAttribute('autoplay'); v.pause(); return; }
    let visivel = true;
    const toca = () => { if (!visivel || !v.paused) return; const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    // tenta já, a cada etapa do carregamento e a cada gesto/retorno à aba (Safari em economia de energia só libera após um toque)
    toca();
    ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'pause', 'stalled', 'suspend'].forEach((ev) => v.addEventListener(ev, toca));
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((ev) => addEventListener(ev, toca, { passive: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) toca(); });
    new IntersectionObserver(([e]) => { visivel = e.isIntersecting; if (visivel) toca(); else v.pause(); }, { threshold: 0.05 }).observe(v);
  });
})();
