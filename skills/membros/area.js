/* Faísca: área de membros (entrada por e-mail + painel de skills). Sem dependências. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');
  const raiz = document.documentElement;
  const PAGINA = 20, PREVIA = 6;
  const estado = { cat: 'inicio', q: '', lic: 'todas', orig: 'todas', sel: null, limite: PAGINA };
  let D = null, porId = new Map(), porCat = new Map();
  let focoAntes = null;
  let souAdmin = false;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const bytes = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`);
  const licCurta = (x) => (x.autoral ? 'Autoral' : x.licenca);
  /* API da mesma origem (o servidor guarda a sessão em cookie HttpOnly) */
  const API = '/skills/api/membros';
  const zipSkill = (id) => `${API}/zip?s=${encodeURIComponent(id)}`;
  const zipCat = (slug) => `${API}/zip?cat=${encodeURIComponent(slug)}`;
  const ZIP_TUDO = `${API}/zip?todas=1`;
  const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } };
  const le = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  /* o catálogo só é buscado depois que a sessão existe: sem sessão o painel nem monta a lista */
  function carregarCatalogo() {
    fetch('dados/catalogo.json', { cache: 'no-cache' }).then((r) => r.json()).then(iniciar).catch(() => {
      $('#lista').innerHTML = '<div class="vazio"><h2>Não foi possível carregar o catálogo</h2><p>Atualize a página. Se continuar, fale com o suporte da Faísca.</p></div>';
    });
  }

  function iniciar(dados) {
    D = dados;
    D.skills.forEach((s) => porId.set(s.id, s));
    D.categorias.forEach((c) => porCat.set(c.slug, c));
    $$('[data-baixar-tudo]').forEach((a) => { a.href = ZIP_TUDO; });
    $$('[data-tamanho-tudo]').forEach((el) => { el.textContent = `(${bytes(D.todas.bytes_zip)})`; });
    $$('[data-ano]').forEach((el) => { el.textContent = new Date().getFullYear(); });
    montarFiltros(); montarBarra(); montarInicio();
    $('#r-skills').textContent = D.skills.length;
    $('#r-cats').textContent = D.categorias.length;
    $('#r-orig').textContent = new Set(D.skills.map((s) => s.origem && s.origem.nome)).size;
    lerHash(true); renderTudo();
    window.addEventListener('hashchange', () => {
      const antes = estado.cat; lerHash();
      if (antes !== estado.cat) { estado.q = ''; estado.lic = 'todas'; estado.orig = 'todas'; $('#busca').value = ''; $('#f-lic').value = 'todas'; $('#f-orig').value = 'todas'; renderTudo(); } else renderSelecao();
    });
    matchMedia('(min-width: 80rem)').addEventListener('change', atualizarVeu);
  }

  /* ---------- rotas por hash ---------- */
  function lerHash(inicial) {
    let h = location.hash.replace(/^#\/?/, ''); try { h = decodeURIComponent(h); } catch (e) { h = ''; }
    const [tipo, v] = h.split('/');
    if (tipo === 'categoria' && porCat.has(v)) { estado.cat = v; estado.sel = null; }
    else if (tipo === 'skill' && porId.has(v)) { estado.sel = v; const c = porId.get(v).categoria; if (inicial || (estado.cat !== 'todas' && estado.cat !== c)) estado.cat = c; }
    else if (tipo === 'skills') { estado.cat = 'todas'; estado.sel = null; }
    else if (tipo === 'admin' && souAdmin) { estado.cat = 'admin'; estado.sel = null; }
    else { estado.cat = 'inicio'; estado.sel = null; }
  }
  const hashAtual = () => (estado.cat === 'inicio' ? '#/' : estado.cat === 'todas' ? '#/skills' : estado.cat === 'admin' ? '#/admin' : `#/categoria/${estado.cat}`);

  /* troca de tela: o conteúdo entra com desfoque e os itens sobem a cada 60 ms (só visual) */
  let tTroca;
  function trocaDeTela() {
    const m = $('.miolo'); if (!m) return;
    clearTimeout(tTroca); m.classList.remove('troca'); void m.offsetWidth; m.classList.add('troca');
    tTroca = setTimeout(() => m.classList.remove('troca'), 1100);
  }
  const capa = (c, extra = '') => `<div class="capa" data-cat="${c.slug}"><span class="capa-ic"><svg class="ic"><use href="#i-${c.slug}"/></svg></span><div class="capa-txt"><h2 id="g-${c.slug}">${esc(c.nome)}</h2><p>${c.total} ${c.total === 1 ? 'skill' : 'skills'}</p></div>${extra}</div>`;

  /* ---------- início: banner da comunidade (já no HTML) + módulos de skills ---------- */
  function montarInicio() {
    $('#modulos').innerHTML = D.categorias.map((c) => `<li><a class="modulo" href="#/categoria/${esc(c.slug)}" data-cat="${esc(c.slug)}">
      <span class="mod-capa"><img src="assets/laranja/p/${esc(c.slug)}.webp" alt="" width="640" height="361" loading="lazy" decoding="async"><span class="mod-ic"><svg class="ic"><use href="#i-${esc(c.slug)}"/></svg></span></span>
      <span class="mod-nome">${esc(c.nome)}</span>
      <span class="mod-n">${c.total} ${c.total === 1 ? 'skill' : 'skills'}</span></a></li>`).join('');
  }

  /* ---------- admin: leads com botão de WhatsApp e lista de quem comprou (só o e-mail admin) ---------- */
  const soDigitos = (t) => String(t || '').replace(/\D/g, '');
  function foneBonito(t) {
    let d = soDigitos(t); if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return t || '';
  }
  function quando(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    const curto = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.floor(min / 60)} h`;
    return curto;
  }
  const zapLead = (l) => {
    const nome = String(l.nome || '').trim().split(/\s+/)[0] || '';
    const resto = D ? D.skills.length - 5 : 374;
    const msg = `Oi${nome ? ', ' + nome : ''}. Você baixou as 5 skills da Faísca. Já testou a systematic-debugging? Se o Claude Code te ajudou, no painel tem as outras ${resto}, nas categorias que você mais usa: https://alexandreh.com/skills/#painel`;
    return `https://wa.me/${soDigitos(l.telefone)}?text=${encodeURIComponent(msg)}`;
  };
  const vazioAdm = (t) => `<li class="linha adm-vazio"><p class="l-desc">${esc(t)}</p></li>`;
  /* o funil vem em outra chamada: cada chamada tem o seu orçamento de leituras no servidor */
  async function carregarFunil() {
    try {
      const r = await fetch(`${API}/admin?parte=funil`, { credentials: 'same-origin', cache: 'no-store' });
      const a = await r.json().catch(() => ({})); const f = (a && a.funil) || null;
      if (!r.ok || !f) { $('#adm-funil').textContent = 'Funil indisponível agora.'; return; }
      $('#adm-n-visitas').textContent = f.visita || 0;
      $('#adm-funil').textContent = `Funil dos últimos ${f.dias || 7} dias: ${f.visita || 0} visitas, ${f.abre_baixar || 0} abriram o download, ${f.baixou_gratis || 0} baixaram, ${f.clique_painel || 0} olharam o painel, ${f.clique_comprar || 0} clicaram em comprar, ${f.compra_aprovada || 0} compraram.`;
    } catch (x) { $('#adm-funil').textContent = 'Funil indisponível agora.'; }
  }
  let admCarregou = 0;
  async function carregarAdmin() {
    if (Date.now() - admCarregou < 15000) return; /* volta à aba sem refazer a busca */
    $('#adm-leads').innerHTML = vazioAdm('Carregando…'); $('#adm-compras').innerHTML = vazioAdm('Carregando…');
    try {
      const r = await fetch(`${API}/admin`, { credentials: 'same-origin', cache: 'no-store' });
      const a = await r.json().catch(() => ({}));
      if (!r.ok || !a.ok) { const m = r.status === 403 ? 'Acesso restrito.' : 'Não foi possível carregar agora. Atualize a página.'; $('#adm-leads').innerHTML = vazioAdm(m); $('#adm-compras').innerHTML = vazioAdm(m); return; }
      admCarregou = Date.now();
      $('#adm-n-leads').textContent = a.totais.leads; $('#adm-n-compras').textContent = a.totais.compras;
      carregarFunil();
      $('#adm-leads').innerHTML = a.leads.length ? a.leads.map((l) => `<li class="linha adm-linha">
        <span class="l-nome adm-nome">${esc(l.nome || 'Sem nome')}</span>
        <p class="l-desc">${esc(foneBonito(l.telefone))}</p>
        <div class="l-meta"><span class="chip">${esc(l.skill === 'todas' ? 'As 5 grátis' : l.skill)}</span><span class="l-orig" title="${esc(l.quando)}">${esc(quando(l.quando))}</span></div>
        ${soDigitos(l.telefone) ? `<a class="botao botao-acao l-baixar" href="${esc(zapLead(l))}" target="_blank" rel="noopener" aria-label="Chamar ${esc(l.nome || 'o lead')} no WhatsApp"><svg class="ic"><use href="#i-whats"/></svg><span>WhatsApp</span></a>` : '<span class="chip l-baixar" title="Cadastro antigo, sem os dados na lista">Incompleto</span>'}
      </li>`).join('') : vazioAdm('Ninguém baixou as grátis ainda.');
      $('#adm-compras').innerHTML = a.compras.length ? a.compras.map((c) => `<li class="linha adm-linha">
        <span class="l-nome adm-nome">${esc(c.nome || 'Sem nome')}</span>
        <p class="l-desc">${esc(c.email)}</p>
        <div class="l-meta"><span class="chip">${esc(c.produto || 'Painel Faísca')}</span><span class="l-orig" title="${esc(c.quando)}">${esc(quando(c.quando))}</span></div>
        <a class="botao botao-vidro l-baixar" href="mailto:${esc(c.email)}" aria-label="Escrever para ${esc(c.nome || c.email)}"><svg class="ic"><use href="#i-link"/></svg><span>E-mail</span></a>
      </li>`).join('') : vazioAdm('Nenhuma compra ainda.');
    } catch (x) { $('#adm-leads').innerHTML = vazioAdm('Sem conexão. Tente de novo.'); $('#adm-compras').innerHTML = vazioAdm('Sem conexão. Tente de novo.'); }
  }

  /* ---------- filtros ---------- */
  function montarFiltros() {
    const lic = ['todas', ...new Set(D.skills.map(licCurta))];
    $('#f-lic').innerHTML = lic.map((l) => `<option value="${esc(l)}">${l === 'todas' ? 'Todas' : esc(l)}</option>`).join('');
    const orig = [...new Set(D.skills.map((s) => (s.origem ? s.origem.nome : 'Sem origem')))].sort((a, b) => a.localeCompare(b));
    $('#f-orig').innerHTML = `<option value="todas">Todas</option>` + orig.map((o) => `<option value="${esc(o)}">${esc(o.length > 46 ? o.slice(0, 44) + '…' : o)}</option>`).join('');
    let t; $('#busca').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { estado.q = e.target.value; estado.limite = PAGINA; renderLista(); }, 120); });
    $('#f-lic').addEventListener('change', (e) => { estado.lic = e.target.value; estado.limite = PAGINA; renderLista(); });
    $('#f-orig').addEventListener('change', (e) => { estado.orig = e.target.value; estado.limite = PAGINA; renderLista(); });
  }

  const visiveis = () => {
    const q = norm(estado.q.trim());
    return D.skills.filter((s) => (estado.cat === 'todas' || s.categoria === estado.cat)
      && (estado.lic === 'todas' || licCurta(s) === estado.lic)
      && (estado.orig === 'todas' || (s.origem ? s.origem.nome : 'Sem origem') === estado.orig)
      && (!q || norm(`${s.id} ${s.descricao} ${s.origem ? s.origem.nome : ''} ${s.autor}`).includes(q)));
  };

  /* ---------- render ---------- */
  function renderTudo() {
    const cat = porCat.get(estado.cat);
    const inicio = estado.cat === 'inicio';
    const admin = estado.cat === 'admin';
    const titulo = inicio ? 'Início' : admin ? 'Admin' : cat ? cat.nome : 'Todas as skills';
    $('#titulo').textContent = titulo;
    document.title = `${titulo} | Faísca`;
    trocaDeTela();
    /* acima do título: "Faísca" no início; nas outras telas, o caminho de volta */
    $('#cab-sobre').innerHTML = inicio ? 'Faísca' : '<a class="voltar" href="#/"><svg class="ic"><use href="#i-voltar"/></svg>Início</a>';
    $('#teto').textContent = inicio ? 'Entre na comunidade e escolha um módulo de skills para ver e baixar.' : cat ? cat.texto : admin ? 'Leads e compradores da Faísca. Só você vê esta tela.' : `Biblioteca com ${D.skills.length} skills para o Claude Code, em ${D.categorias.length} categorias. Baixe uma por uma ou tudo de uma vez.`;
    const bc = $('#baixar-cat'); bc.hidden = !cat;
    if (cat) { bc.href = zipCat(cat.slug); $('span', bc).textContent = `Baixar esta categoria (${bytes(cat.bytes_zip)})`; }
    $('#inicio').hidden = !inicio; $('#admin').hidden = !admin;
    $('#resumo').hidden = estado.cat !== 'todas';
    $('#filtros').hidden = inicio || admin; $('#lista').hidden = inicio || admin;
    estado.limite = PAGINA;
    $$('#topo-nav a').forEach((a) => { const atual = a.dataset.cat === estado.cat; a.toggleAttribute('aria-current', atual); if (atual) a.setAttribute('aria-current', 'page'); });
    if (admin) carregarAdmin();
    if (!inicio && !admin) renderLista(); else renderSelecao();
  }

  function linha(s) {
    const tam = bytes(s.bytes_zip);
    return `<li class="linha" data-id="${esc(s.id)}" ${estado.sel === s.id ? 'aria-current="true"' : ''}>
      <button type="button" class="l-nome" aria-label="Ver detalhes de ${esc(s.id)}">${esc(s.id)}</button>
      <p class="l-desc">${esc(s.descricao)}</p>
      <div class="l-meta"><span class="l-orig">${esc(s.origem ? s.origem.nome : 'Origem não informada')}</span><span class="chip${s.autoral ? ' chip-autoral' : ''}">${esc(licCurta(s))}</span></div>
      <a class="botao botao-vidro l-baixar" href="${zipSkill(s.id)}" download aria-label="Baixar ${esc(s.id)} (zip, ${tam})" title="${tam}"><svg class="ic"><use href="#i-baixar"/></svg><span>Baixar</span></a>
    </li>`;
  }

  function renderLista() {
    const v = visiveis();
    const total = estado.cat === 'todas' ? D.skills.length : porCat.get(estado.cat).total;
    const filtrando = !!estado.q.trim() || estado.lic !== 'todas' || estado.orig !== 'todas';
    const alvo = $('#lista');
    if (!v.length) {
      $('#contagem').textContent = `0 de ${total} skills`;
      alvo.innerHTML = '<div class="vazio"><span class="vazio-cena" aria-hidden="true"><svg class="ic"><use href="#i-vazio"/></svg></span><h2>Nenhuma skill encontrada</h2><p>Tente outra palavra ou limpe os filtros.</p><button type="button" class="botao botao-acao" id="limpar">Limpar filtros</button></div>';
      $('#limpar').addEventListener('click', limparFiltros); return;
    }
    const previa = estado.cat === 'todas' && !filtrando;
    if (estado.sel && !previa) { const i = v.findIndex((s) => s.id === estado.sel); if (i >= estado.limite) estado.limite = Math.ceil((i + 1) / PAGINA) * PAGINA; }
    const mostradas = previa ? v : v.slice(0, estado.limite);
    const resta = previa ? 0 : v.length - mostradas.length;
    $('#contagem').textContent = previa ? `${total} skills. Cada categoria mostra ${PREVIA}; abra a categoria para ver todas.` : v.length === total ? `${total} skills${resta ? `, mostrando ${mostradas.length}` : ''}` : `${v.length} de ${total} skills${resta ? `, mostrando ${mostradas.length}` : ''}`;
    if (estado.cat === 'todas') {
      alvo.innerHTML = D.categorias.map((c) => {
        const todos = mostradas.filter((s) => s.categoria === c.slug); if (!todos.length) return '';
        const itens = previa ? todos.slice(0, PREVIA) : todos;
        const mais = previa && todos.length > PREVIA ? `<li class="linha-mais"><a href="#/categoria/${c.slug}">Ver as ${todos.length} skills de ${esc(c.nome)}</a></li>` : '';
        return `<section class="grupo" aria-labelledby="g-${c.slug}">${capa({ ...c, total: todos.length }, `<a class="capa-abrir" href="#/categoria/${c.slug}">Abrir categoria</a>`)}<ul class="quadro" role="list">${itens.map(linha).join('')}${mais}</ul></section>`;
      }).join('');
    } else {
      alvo.innerHTML = `${estado.cat !== 'todas' ? capa(porCat.get(estado.cat)) : ''}<ul class="quadro" role="list">${mostradas.map(linha).join('')}</ul>`;
    }
    if (resta) {
      alvo.insertAdjacentHTML('beforeend', `<div class="mais-caixa"><button type="button" class="botao botao-vidro" id="mais">Mostrar mais ${Math.min(PAGINA, resta)} <small>(faltam ${resta})</small></button></div>`);
      $('#mais').addEventListener('click', () => { const antes = $$('.linha').length; estado.limite += PAGINA; renderLista(); const nova = $$('.linha')[antes]; if (nova) $('.l-nome', nova).focus({ preventScroll: true }); });
    }
    renderSelecao();
  }

  function limparFiltros() {
    estado.q = ''; estado.lic = 'todas'; estado.orig = 'todas'; estado.limite = PAGINA;
    $('#busca').value = ''; $('#f-lic').value = 'todas'; $('#f-orig').value = 'todas'; renderLista();
  }

  function renderSelecao() {
    $$('.linha[aria-current]').forEach((l) => l.removeAttribute('aria-current'));
    const s = estado.sel && porId.get(estado.sel);
    if (!s) { fecharPainelVisual(); return; }
    const el = $(`.linha[data-id="${CSS.escape(s.id)}"]`); if (el) el.setAttribute('aria-current', 'true');
    abrirPainel(s);
  }

  /* ---------- painel de detalhes ---------- */
  function abrirPainel(s) {
    const pa = $('#painel'); const cat = porCat.get(s.categoria);
    const orig = s.origem ? (s.origem.url && /^https:\/\/github\.com\//.test(s.origem.url) ? `<a href="${esc(s.origem.url)}" target="_blank" rel="noopener">${esc(s.origem.nome)} <svg class="ic" style="width:.9rem;height:.9rem"><use href="#i-link"/></svg></a>` : esc(s.origem.nome)) : 'Não informada';
    const cmd = `unzip ${s.id}.zip -d ~/.claude/skills/`;
    $('#painel-miolo').innerHTML = `
      <div class="p-topo"><div><h2 class="p-nome" id="p-nome">${esc(s.id)}</h2>
        <div class="p-chips"><span class="chip">${esc(cat.nome)}</span><span class="chip${s.autoral ? ' chip-autoral' : ''}">${esc(licCurta(s))}</span></div></div>
        <button type="button" class="icone" id="p-fechar" aria-label="Fechar detalhes"><svg class="ic"><use href="#i-fechar"/></svg></button></div>
      <section class="p-sec"><h3>O que faz</h3><p class="p-desc">${esc(s.descricao)}</p></section>
      <section class="p-sec"><h3>Origem e licença</h3><dl class="p-dl">
        <div><dt>Origem</dt><dd>${orig}</dd></div>
        <div><dt>Autor</dt><dd>${esc(s.autor)}</dd></div>
        <div><dt>Licença</dt><dd>${esc(s.licenca)}${s.autoral ? '' : ' (arquivo LICENSE incluído na pasta)'}</dd></div>
        <div><dt>Tamanho</dt><dd>${s.arquivos} ${s.arquivos === 1 ? 'arquivo' : 'arquivos'} · zip de ${bytes(s.bytes_zip)}</dd></div></dl></section>
      <section class="p-sec"><h3>O que vem na pasta</h3><div class="p-pasta">${s.conteudo.map((c) => `<code>${esc(c)}</code>`).join('')}${s.mais ? `<code>+${s.mais}</code>` : ''}</div></section>
      <section class="p-sec"><h3>Instalar</h3><div class="p-cmd"><code>${esc(cmd)}</code><button type="button" class="icone" id="p-copiar" aria-label="Copiar o comando de instalação"><svg class="ic"><use href="#i-copiar"/></svg></button></div>
        <p class="p-nota">Depois reinicie o Claude Code. <span class="p-estado" id="p-estado" aria-live="polite"></span></p></section>
      <a class="botao botao-acao p-baixar" href="${zipSkill(s.id)}" download><svg class="ic"><use href="#i-baixar"/></svg><span>Baixar skill · ${bytes(s.bytes_zip)}</span></a>`;
    pa.setAttribute('aria-labelledby', 'p-nome');
    const jaAberto = pa.classList.contains('aberto');
    pa.removeAttribute('inert'); pa.classList.add('aberto'); app.classList.add('painel-aberto'); atualizarVeu();
    $('#p-fechar').addEventListener('click', fecharPainel);
    $('#p-copiar').addEventListener('click', () => copiar(cmd));
    const ativo = document.activeElement;
    if (!jaAberto) focoAntes = ativo;
    if (!jaAberto || !ativo || ativo === document.body || pa.contains(ativo)) $('#p-fechar').focus({ preventScroll: true });
    pa.scrollTop = 0;
  }
  function fecharPainelVisual() {
    const pa = $('#painel'); if (!pa.classList.contains('aberto')) return;
    pa.classList.remove('aberto'); pa.setAttribute('inert', ''); app.classList.remove('painel-aberto'); atualizarVeu();
  }
  function fecharPainel() {
    const id = estado.sel; estado.sel = null; history.replaceState(null, '', hashAtual());
    fecharPainelVisual(); $$('.linha[aria-current]').forEach((l) => l.removeAttribute('aria-current'));
    const volta = id && $(`.linha[data-id="${CSS.escape(id)}"] .l-nome`);
    const alvo = volta || focoAntes; if (alvo && alvo.focus) alvo.focus({ preventScroll: true });
  }
  async function copiar(txt) {
    const aviso = (m) => { const e = $('#p-estado'); if (e) { e.textContent = m; setTimeout(() => { if (e) e.textContent = ''; }, 2200); } };
    try { await navigator.clipboard.writeText(txt); aviso('Copiado.'); }
    catch (e) { const t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); aviso('Copiado.'); } catch (x) { aviso('Copie manualmente.'); } t.remove(); }
  }

  function irPara(id, substituir) {
    const h = `#/skill/${encodeURIComponent(id)}`;
    if (!substituir) { location.hash = h; return; }
    history.replaceState(null, '', h); lerHash(); renderSelecao();
  }

  /* ---------- lista: clique e teclado ---------- */
  $('#lista').addEventListener('click', (e) => {
    if (e.target.closest('a.l-baixar') || e.target.closest('.capa a')) return;
    const li = e.target.closest('.linha'); if (!li) return;
    location.hash = `#/skill/${encodeURIComponent(li.dataset.id)}`;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#dlg-instalar').open) return;
      if ($('#painel').classList.contains('aberto')) { fecharPainel(); return; }
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && $('#painel').classList.contains('aberto') && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
      const linhas = $$('.linha'); const i = linhas.findIndex((li) => li.dataset.id === estado.sel); if (i < 0) return;
      const prox = linhas[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (!prox) return;
      e.preventDefault(); irPara(prox.dataset.id, true); prox.scrollIntoView({ block: 'nearest' });
    }
  });

  /* ---------- véu do painel de detalhes ---------- */
  function atualizarVeu() {
    const v = $('#veu'); const painel = $('#painel').classList.contains('aberto');
    v.hidden = !painel; v.className = 'veu so-painel';
    /* sob o véu, o que está atrás não recebe foco nem leitor de tela */
    const larga = matchMedia('(min-width: 80rem)').matches; const cobre = painel && !larga;
    $('#conteudo').inert = cobre; $('#topo').inert = cobre;
  }
  $('#veu').addEventListener('click', () => fecharPainel());

  /* ---------- ajuda ---------- */
  function montarBarra() {
    const dlg = $('#dlg-instalar');
    $('#como-instalar').addEventListener('click', () => dlg.showModal());
    $('[data-fechar]', dlg).addEventListener('click', () => dlg.close());
  }

  /* ═══ porta de entrada: e-mail → código de 6 dígitos → painel ═══ */
  const acesso = $('#acesso');
  const p1 = $('#ac-p1'), p2 = $('#ac-p2');
  const campoEmail = $('#ac-email'), campoCodigo = $('#ac-codigo'), btnReenviar = $('#ac-reenviar');
  let emailAtual = '', painelIniciado = false, tReenviar = null;

  const post = (rota, corpo) => fetch(`${API}/${rota}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
  const lerJson = async (r) => { try { return await r.json(); } catch (e) { return {}; } };
  const MSG_REDE = 'Não consegui falar com o servidor. Confira a internet e tente de novo.';
  const MSG_MUITAS = 'Muitas tentativas. Espere alguns minutos e tente de novo.';

  /* erro sempre em texto (nunca só cor), com o campo marcado e o foco nele */
  function erro(n, texto, campo) {
    const el = $(`#ac-erro-${n}`);
    if (!texto) { el.hidden = true; if (campo) campo.removeAttribute('aria-invalid'); return; }
    $('span', el).textContent = texto; el.hidden = false;
    if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); }
  }
  function ocupado(botao, sim, texto) {
    const r = $('.rotulo', botao);
    if (sim && r) { r.dataset.antes = r.textContent; r.textContent = texto; }
    if (!sim && r && r.dataset.antes) r.textContent = r.dataset.antes;
    botao.setAttribute('aria-busy', String(sim)); botao.disabled = sim;
  }
  function mostrarPasso(n) {
    $('#ac-carregando').hidden = true; p1.hidden = n !== 1; p2.hidden = n !== 2;
    if (n === 1) campoEmail.focus(); else campoCodigo.focus();
  }
  function mostrarAcesso() { acesso.hidden = false; $('#app').hidden = true; mostrarPasso(1); }

  /* reenviar só depois de 30 s, com a contagem à vista */
  function contagemReenviar() {
    let resta = 30; clearInterval(tReenviar);
    btnReenviar.disabled = true; btnReenviar.textContent = `Reenviar em ${resta} s`;
    tReenviar = setInterval(() => {
      resta -= 1;
      if (resta <= 0) { clearInterval(tReenviar); btnReenviar.disabled = false; btnReenviar.textContent = 'Reenviar código'; }
      else btnReenviar.textContent = `Reenviar em ${resta} s`;
    }, 1000);
  }
  function aviso2(j, reenvio) {
    $('#ac-apoio-2').textContent = reenvio ? 'Enviamos um novo código. Só o mais recente vale.' : ((j && j.mensagem) || `Enviamos um código de 6 dígitos para ${emailAtual}.`);
    const dev = $('#ac-dev'); const c = j && j.codigoDev; dev.hidden = !c; if (c) dev.textContent = `Só em desenvolvimento: o código é ${c}.`;
  }

  async function pedirCodigo(reenvio) {
    erro(1, ''); erro(2, '');
    const passo = reenvio ? 2 : 1, campo = reenvio ? campoCodigo : campoEmail, botao = $('#ac-enviar-1');
    if (!reenvio) {
      const e = campoEmail.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { erro(1, 'Digite o e-mail completo, por exemplo voce@exemplo.com.', campoEmail); return; }
      emailAtual = e; ocupado(botao, true, 'Enviando…');
    } else { clearInterval(tReenviar); btnReenviar.disabled = true; btnReenviar.textContent = 'Enviando…'; }
    try {
      const r = await post('entrar', { email: emailAtual }); const j = await lerJson(r);
      if (r.ok) { aviso2(j, reenvio); if (!reenvio) { campoCodigo.value = ''; mostrarPasso(2); } contagemReenviar(); }
      else {
        erro(passo, j.erro || (r.status === 429 ? MSG_MUITAS : 'Não foi possível enviar o código agora. Tente de novo em instantes.'), campo);
        if (reenvio) { btnReenviar.disabled = false; btnReenviar.textContent = 'Reenviar código'; }
      }
    } catch (x) {
      erro(passo, MSG_REDE, campo);
      if (reenvio) { btnReenviar.disabled = false; btnReenviar.textContent = 'Reenviar código'; }
    }
    if (!reenvio) ocupado(botao, false);
  }

  p1.addEventListener('submit', (e) => { e.preventDefault(); pedirCodigo(false); });
  btnReenviar.addEventListener('click', () => pedirCodigo(true));
  $('#ac-voltar').addEventListener('click', () => { clearInterval(tReenviar); erro(2, ''); mostrarPasso(1); });
  campoEmail.addEventListener('input', () => erro(1, '', campoEmail));
  campoCodigo.addEventListener('input', () => {
    campoCodigo.value = campoCodigo.value.replace(/\D/g, '').slice(0, 6); erro(2, '', campoCodigo);
    if (campoCodigo.value.length === 6 && !$('#ac-enviar-2').disabled) p2.requestSubmit();
  });
  p2.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = campoCodigo.value.replace(/\D/g, '');
    if (codigo.length !== 6) { erro(2, 'O código tem 6 dígitos. Confira o e-mail e digite de novo.', campoCodigo); return; }
    const botao = $('#ac-enviar-2'); erro(2, ''); ocupado(botao, true, 'Entrando…');
    try {
      const r = await post('codigo', { email: emailAtual, codigo }); const j = await lerJson(r);
      if (r.ok) { clearInterval(tReenviar); await verificarSessao(); ocupado(botao, false); return; }
      erro(2, j.erro || (r.status === 429 ? MSG_MUITAS : 'Código inválido ou vencido. Confira o e-mail ou peça um novo código.'), campoCodigo);
      campoCodigo.select();
    } catch (x) { erro(2, MSG_REDE, campoCodigo); }
    ocupado(botao, false);
  });

  /* entra no painel: só agora o catálogo é buscado */
  function abrirPainelDeMembros(email, admin) {
    acesso.hidden = true; $('#app').hidden = false;
    souAdmin = !!admin; $('#nav-admin').hidden = !souAdmin;
    $('#sair').title = email ? `Sair (${email})` : 'Sair da área de membros';
    if (!painelIniciado) { painelIniciado = true; carregarCatalogo(); }
    $('#conteudo').focus({ preventScroll: true });
  }
  async function verificarSessao() {
    try {
      const r = await fetch(`${API}/eu`, { credentials: 'same-origin', cache: 'no-store' });
      if (r.ok) { const j = await lerJson(r); if (j.email) { abrirPainelDeMembros(j.email, j.admin); return true; } } /* 200 sem e-mail também vale como "sem sessão" */
      mostrarAcesso();
    } catch (x) { mostrarAcesso(); erro(1, MSG_REDE); }
    return false;
  }
  $('#sair').addEventListener('click', async () => {
    try { await post('sair'); } catch (x) { /* mesmo sem resposta, a tela volta ao acesso */ }
    history.replaceState(null, '', location.pathname); location.reload();
  });
  $$('[data-ano]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  verificarSessao();
})();
