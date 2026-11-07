/* KIT RESPONSIVO DE CARA — efeitos.js (sem dependencia, ~1 KB)
   - .revelar: aparece ao entrar na tela, com escalonamento (--i) entre irmaos
   - [data-contar="1200"]: numero sobe ate o valor quando aparece
   - .mais-celular + [data-ver-mais]: botao "ver mais" da lista cortada no celular
   - [data-topo]: cabecalho estendido no topo, capsula flutuante depois do 1o scroll (.rolado)
   - [data-ano]: ano corrente no rodape; reserva do <details name> para a FAQ exclusiva
   Respeita prefers-reduced-motion. Sem JS, o conteudo continua visivel
   (a classe js-ok so entra se o script rodar). */
(() => {
  const semMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js-ok');

  // Escalonamento automatico: cada .revelar recebe seu indice entre os irmaos.
  document.querySelectorAll('.revelar').forEach(el => {
    const irmaos = [...el.parentElement.children].filter(x => x.classList.contains('revelar'));
    el.style.setProperty('--i', Math.min(irmaos.indexOf(el), 6));
  });

  const contar = el => {
    const alvo = parseFloat(el.dataset.contar), casas = (el.dataset.contar.split('.')[1] || '').length;
    const pre = el.dataset.prefixo || '', suf = el.dataset.sufixo || '';
    const fmt = v => pre + v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + suf;
    if (semMovimento) { el.textContent = fmt(alvo); return; }
    const t0 = performance.now(), dur = 1100;
    const passo = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(alvo * e); if (p < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  };

  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('visivel');
      if (e.target.dataset.contar) contar(e.target);
      e.target.querySelectorAll?.('[data-contar]').forEach(contar);
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  document.querySelectorAll('.revelar, [data-contar]').forEach(el => io.observe(el));

  // Cabecalho estendido no topo → capsula flutuante depois do 1o scroll ([data-topo] ganha .rolado).
  // Sentinela + IntersectionObserver: nada de evento de scroll.
  const topo = document.querySelector('[data-topo]');
  if (topo) {
    const sentinela = document.createElement('div');
    sentinela.setAttribute('aria-hidden', 'true');
    sentinela.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:16px;pointer-events:none';
    document.body.prepend(sentinela);
    new IntersectionObserver(([e]) => topo.classList.toggle('rolado', !e.isIntersecting)).observe(sentinela);
  }

  // O ano do rodape e conta, nao texto.
  document.querySelectorAll('[data-ano]').forEach(el => { el.textContent = new Date().getFullYear(); });

  // FAQ: abrir uma fecha a outra. <details name="x"> faz isso nativamente; este e o reserva
  // para navegador sem suporte a "name" (so age se o navegador nao fechar sozinho).
  if (!('name' in HTMLDetailsElement.prototype)) {
    document.querySelectorAll('details[name]').forEach(d => d.addEventListener('toggle', () => {
      if (!d.open) return;
      document.querySelectorAll(`details[name="${d.name || d.getAttribute('name')}"][open]`).forEach(o => { if (o !== d) o.open = false; });
    }));
  }

  document.querySelectorAll('[data-ver-mais]').forEach(btn => {
    const lista = document.querySelector(btn.dataset.verMais);
    if (!lista) return;
    const escondidos = [...lista.children].slice(4);
    if (!escondidos.length) { btn.hidden = true; return; }
    btn.addEventListener('click', () => {
      const abrir = !escondidos[0].classList.contains('mostrar');
      escondidos.forEach(x => x.classList.toggle('mostrar', abrir));
      btn.setAttribute('aria-expanded', abrir);
      btn.textContent = abrir ? 'Ver menos' : `Ver mais ${escondidos.length}`;
    });
  });
})();
