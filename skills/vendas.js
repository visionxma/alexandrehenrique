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

  // ---- download grátis: janela com nome e WhatsApp, anti-robô e validação do número ----
  const janela = document.getElementById('janela-baixar');
  if (janela) {
    const form = document.getElementById('form-baixar');
    const API = janela.dataset.api || '/skills/api';
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    const erroEl = form.querySelector('.erro'), enviar = form.querySelector('.jb-enviar');
    const etapa = (n) => form.querySelectorAll('.jb-etapa').forEach((e) => { e.hidden = e.dataset.etapa !== n; });
    let skill = '', desafio = '', solucaoP = null, ultimoFoco = null;
    const DDD = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
    const soDigitos = (v) => v.replace(/\D/g, '');
    const mascara = (v) => { const d = soDigitos(v).slice(0, 11); if (d.length <= 2) return d ? `(${d}` : ''; if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`; if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; };
    const telefoneOk = (v) => { const d = soDigitos(v); if (d.length !== 11) return 'Informe o WhatsApp com DDD e 9 dígitos, por exemplo (99) 99999-9999.'; if (!DDD.has(d.slice(0, 2))) return 'Esse DDD não existe. Confira o número.'; if (d[2] !== '9') return 'O número de celular começa com 9 depois do DDD.'; const n = d.slice(2); if (/^(\d)\1+$/.test(n) || '0123456789'.includes(n.slice(1)) || '9876543210'.includes(n.slice(1))) return 'Esse número parece inválido. Confira os dígitos.'; return ''; };
    const nomeOk = (v) => { const p = v.trim().split(/\s+/).filter((x) => x.length > 1); if (p.length < 2 || v.trim().length < 5) return 'Informe nome e sobrenome.'; if (!/^[\p{L}][\p{L}\s'.-]+$/u.test(v.trim())) return 'Use só letras no nome.'; return ''; };
    const mostraErro = (m) => { erroEl.textContent = m; erroEl.hidden = !m; };

    // anti-robô por prova de trabalho: o servidor entrega um desafio assinado e o navegador o resolve em segundo plano
    const preparaDesafio = () => {
      desafio = ''; solucaoP = null;
      return fetch(API + '/desafio', { credentials: 'same-origin', cache: 'no-store' }).then((r) => r.json()).then((j) => {
        desafio = j.desafio; solucaoP = window.resolverDesafio(j.desafio, j.bits);
        solucaoP.catch(() => {}); return true;
      }).catch(() => false);
    };

    document.querySelectorAll('[data-baixar]').forEach((b) => b.addEventListener('click', async () => {
      ultimoFoco = b; skill = b.dataset.baixar; mostraErro('');
      janela.querySelector('[data-skill-nome]').textContent = skill === 'todas' ? 'as 5 skills grátis' : skill;
      etapa('form'); enviar.disabled = false;
      if (typeof janela.showModal === 'function') janela.showModal(); else janela.setAttribute('open', '');
      form.nome.focus();
      const ok = await preparaDesafio();
      if (!ok) mostraErro('Não foi possível iniciar a verificação. Recarregue a página e tente de novo.');
    }));
    const fechar = () => { if (janela.open) janela.close(); if (ultimoFoco) ultimoFoco.focus(); };
    janela.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) fechar(); });
    form.telefone.addEventListener('input', () => { form.telefone.value = mascara(form.telefone.value); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault(); mostraErro('');
      const nome = form.nome.value.trim(), tel = form.telefone.value;
      const e1 = nomeOk(nome) || telefoneOk(tel) || (form.aceito.checked ? '' : 'Marque que leu e aceita a Política de Privacidade.');
      if (e1) { mostraErro(e1); return; }
      if (!solucaoP) { mostraErro('A verificação ainda não iniciou. Aguarde um instante e tente de novo.'); return; }
      enviar.disabled = true; enviar.dataset.texto = enviar.textContent; enviar.lastChild.textContent = 'Verificando...';
      try {
        const solucao = await solucaoP;
        const r = await fetch(API + '/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ nome, telefone: soDigitos(tel), skill, desafio, solucao, aceito: true, hp: form.site.value }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) { mostraErro(j.erro || 'Não foi possível liberar agora. Tente de novo em instantes.'); preparaDesafio(); enviar.disabled = false; enviar.lastChild.textContent = 'Baixar agora'; return; }
        janela.querySelector('.jb-de-novo').href = j.url; etapa('ok'); try { if (window.fbq) fbq('track', 'Lead'); } catch (_) { /* pixel bloqueado: segue */ }
        const a = document.createElement('a'); a.href = j.url; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
      } catch (_) { mostraErro('Sem conexão. Verifique a internet e tente de novo.'); enviar.disabled = false; enviar.lastChild.textContent = 'Baixar agora'; }
    });
  }
})();

/* Medição do funil: só conta etapas (sem dado pessoal). Falha em silêncio; nunca atrapalha a página. */
(() => {
  const avisa = (evento) => {
    try {
      fetch('/skills/api/medir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evento }), keepalive: true }).catch(() => {});
    } catch { /* sem rede: segue */ }
  };
  let visto = false;
  try { visto = sessionStorage.getItem('faisca-visita') === '1'; sessionStorage.setItem('faisca-visita', '1'); } catch { /* sem sessionStorage */ }
  if (!visto) avisa('visita');
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a,button');
    if (!a) return;
    if (a.matches('[data-baixar]')) avisa('abre_baixar');
    else if (a.matches('a[href="#painel"]')) avisa('clique_painel');
    else if (a.matches('a[href*="nuvpag.com"]')) { avisa('clique_comprar'); try { if (window.fbq) fbq('track', 'InitiateCheckout', { value: 19.9, currency: 'BRL' }); } catch (_) { /* pixel bloqueado: segue */ } }
  }, true);
})();
