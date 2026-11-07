// Gera as páginas /apps/<slug>/ (perfil estilo loja de aplicativos) e o trecho dos ícones da home.
// Uso: node ferramentas/gerar-apps.mjs   (na raiz do repositório)
// Só entra afirmação que a página oficial do produto já faz.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const ANO = new Date().getFullYear();

export const apps = [
  { slug: 'finagro', nome: 'Finagro', sub: 'Gestão rural para fazenda e sítio', setor: 'Agropecuária', plat: 'Celular e computador', oferta: 'Grátis até 1.000 animais',
    url: 'https://finagro.app', site: 'finagro.app', icone: 'finagro.webp', cap: 'cap-finagro.webp', caps: [1,2,3,4,5,6].map((n) => `finagro-${n}.webp`),
    texto: 'Rebanho, vacinas, GTA, lavoura, contas e fluxo de caixa no celular e no computador. Grátis até 1.000 animais com ficha, sem cartão.',
    pontos: ['Rebanho, vacinas e GTA', 'Lavoura, contas e fluxo de caixa', 'Celular e computador', 'Grátis até 1.000 animais com ficha'] },
  { slug: 'midiamente', nome: 'Mídiamente', sub: 'Gestão com IA para agências de marketing', setor: 'Marketing', plat: 'Web', oferta: 'Online',
    url: 'https://midiamente.app', site: 'midiamente.app', icone: 'midiamente.webp', cap: 'cap-midiamente.webp',
    texto: 'CRM, projetos, calendário editorial, financeiro, cobranças, equipe e aprovação do cliente num só lugar, com inteligência artificial que lê a operação e responde sobre ela.',
    pontos: ['CRM, projetos e calendário editorial', 'Financeiro e cobranças', 'Aprovação do cliente', 'IA que responde sobre a operação'] },
  { slug: 'construsoft', nome: 'ConstruSoft', sub: 'Gestão de obras para construtoras', setor: 'Construção civil', plat: 'Web e celular', oferta: '14 dias grátis',
    url: 'https://construsoftbr.com', site: 'construsoftbr.com', icone: 'construsoft.webp', cap: 'cap-construsoft.webp', caps: [1,2,3,4,5,6].map((n) => `construsoft-${n}.webp`),
    texto: 'Obras, parcelas com recibo em PDF, despesas, estoque e equipe em um sistema só, com usuários ilimitados.',
    pontos: ['Parcelas com recibo em PDF', 'Despesas, estoque e equipe por obra', 'Usuários ilimitados', '14 dias grátis'] },
  { slug: 'frox', nome: 'FroX', sub: 'Gestão de frota de caminhões', setor: 'Transporte e frotas', plat: 'Web e celular', oferta: 'Plano grátis',
    url: 'https://froxbr.com/register', site: 'froxbr.com', icone: 'frox.webp', cap: 'cap-frox.webp', caps: [1,2,3,4,5,6].map((n) => `frox-${n}.webp`),
    texto: 'Registro de viagens, receitas e despesas, custo por caminhão e relatório geral, sem rastreador. Começa com um plano grátis permanente para um caminhão e cresce para o Plano Frotas.',
    pontos: ['Plano Grátis permanente para 1 caminhão', 'Plano Frotas a partir de R$ 63,75/mês', 'Viagens, receitas e despesas no mesmo lugar', 'Funciona sem rastreador'] },
  { slug: 'softpay', nome: 'SoftPay', sub: 'PDV, estoque e vendas para o comércio', setor: 'Comércio e varejo', plat: 'Web e celular', oferta: '7 dias grátis',
    url: 'https://www.softpaybr.com/auth', site: 'softpaybr.com', icone: 'softpay.webp', cap: 'cap-softpay.webp', caps: [1,2,3,4,5,6].map((n) => `softpay-${n}.webp`),
    texto: 'PDV moderno, controle de estoque, vendas no PIX e no cartão, fiado, relatórios e Curva ABC.',
    pontos: ['PDV com PIX e cartão', 'Controle de estoque e Curva ABC', 'Fiado e relatórios', '7 dias grátis, sem cartão'] },
  { slug: 'hotelgestao', nome: 'HotelGestão', sub: 'Sistema para hotel e pousada na nuvem', setor: 'Hotéis e pousadas', plat: 'Web', oferta: '14 dias grátis', tile: 'claro',
    url: 'https://hotelgestao.com.br', site: 'hotelgestao.com.br', icone: 'hotelgestao.svg', cap: 'cap-hotelgestao.webp',
    texto: 'Reservas, caixa, WhatsApp automático, pré-check-in, FNRH digital e motor de reservas sem comissão.',
    pontos: ['Reservas e caixa', 'WhatsApp automático e pré-check-in', 'FNRH digital', 'Motor de reservas sem comissão', '14 dias grátis'] },
  { slug: 'pdf-sem-cadastro', nome: 'PDF sem Cadastro', sub: 'Comprima, junte, assine e converta PDF', setor: 'Ferramentas', plat: 'Web', oferta: 'Grátis',
    url: 'https://pdfsemcadastro.com.br', site: 'pdfsemcadastro.com.br', icone: 'pdf.webp', cap: 'cap-pdf.webp',
    texto: 'Ferramentas de PDF e imagem sem cadastro. Os arquivos não saem do celular ou do computador: ninguém vê, nem a VisionX.',
    pontos: ['Comprimir, juntar, assinar e converter', 'Sem cadastro e grátis', 'O arquivo não sai do seu aparelho'] },
  { slug: 'biblia', nome: 'Bíblia Sagrada: Dia e Noite', sub: 'Rituais de manhã e de noite', setor: 'Leitura e rotina', plat: 'iPhone', oferta: 'Grátis', botao: 'Obter',
    url: 'https://apps.apple.com/br/app/id6826437031', site: 'App Store', icone: 'biblia.webp', cap: null, caps: [1,2,3,4,5,6,7,8].map((n) => `biblia-${n}.webp`),
    texto: 'Aplicativo de iPhone, gratuito, com a leitura da Bíblia organizada em rituais de manhã e de noite.',
    pontos: ['Para iPhone', 'Grátis', 'Rituais de manhã e de noite'] },
  { slug: 'seuplantao', nome: 'Seu Plantão', sub: 'Agenda e faturamento para plantonistas', setor: 'Saúde', plat: 'Celular (instala)', oferta: 'Grátis',
    url: 'https://seuplantao.app', site: 'seuplantao.app', icone: 'seuplantao.webp', cap: 'cap-seuplantao.webp',
    texto: 'Agenda mensal com uma cor por hospital, valores a receber, aviso antes do plantão e relatório em PDF ou Excel para o contador. Funciona offline e instala no celular.',
    pontos: ['Agenda com uma cor por hospital', 'Previsto, recebido e atrasado', 'Relatório em PDF ou Excel', 'Grátis, instala no celular'] },
  { slug: 'advogestao', nome: 'AdvoGestão', sub: 'Gestão jurídica para advogados', setor: 'Advocacia', plat: 'Web', oferta: '7 dias grátis',
    url: 'https://advogestao.com.br', site: 'advogestao.com.br', icone: 'advocacia.webp', cap: 'cap-advocacia.webp',
    texto: 'Processos, prazos, clientes, agenda e financeiro para escritórios de advocacia, com consulta ao CNJ e inteligência artificial. Teste 7 dias grátis, sem cartão.',
    pontos: ['Processos, prazos e clientes', 'Agenda e financeiro', 'Consulta ao CNJ e IA', '7 dias grátis, sem cartão'] },
  { slug: 'brasilvisto', nome: 'BrasilVisto', sub: 'Política, economia e dados, com a fonte à vista', setor: 'Notícias e dados', plat: 'Web', oferta: 'Online',
    url: 'https://brasilvisto.com.br', site: 'brasilvisto.com.br', icone: 'brasilvisto.webp', cap: 'cap-brasilvisto.webp',
    texto: 'Portal de notícias, política, economia, negócios, finanças e indicadores. Agrega manchetes de fontes identificadas e publica análises próprias.',
    pontos: ['Manchetes de fontes identificadas', 'Análises próprias', 'Indicadores de economia e finanças'] },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icone = (a, cls = '') => `<span class="ap-ic ${a.tile === 'claro' ? 'ap-ic--claro' : ''} ${cls}"><img src="/assets/apps/${a.icone}" alt="" width="256" height="256" loading="lazy" decoding="async"></span>`;

const head = (titulo, desc, url, img) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://alexandreh.com${url}">
<meta name="theme-color" content="#000000">
<link rel="icon" href="/assets/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://alexandreh.com${img}">
<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/apps/apps.css">
</head>`;

function pagina(a) {
  const cta = a.url
    ? `<a class="ap-abrir" href="${esc(a.url)}" target="_blank" rel="noopener">${a.botao || 'Abrir'}</a>`
    : `<span class="ap-abrir ap-abrir--off" aria-disabled="true">Em breve</span>`;
  const chips = [['Setor', a.setor], ['Plataforma', a.plat], ['Oferta', a.oferta]]
    .map(([k, v]) => `<div class="ap-chip"><small>${k}</small><strong>${esc(v)}</strong></div>`).join('');
  const img = (c, i, extra = '') => `<img class="${extra}" src="/assets/apps/${c}" alt="Tela ${i + 1} do ${esc(a.nome)}" width="600" height="1304" loading="lazy" decoding="async">`;
  const rail = a.caps ? `<section class="ap-sec"><h2>Pré-visualização</h2><div class="ap-grade ap-grade--${a.caps.length}">${a.caps.map((c, i) => img(c, i, i >= 4 ? 'ap-extra' : '')).join('')}</div><details class="ap-mais"><summary>Ver as outras ${a.caps.length - 4} telas</summary><div class="ap-grade">${a.caps.slice(4).map((c, i) => img(c, i + 4)).join('')}</div></details></section>` : '';
  const cap = a.caps ? rail : a.cap ? `<section class="ap-sec"><h2>Pré-visualização</h2><img class="ap-cap" src="/assets/apps/${a.cap}" alt="Tela do ${esc(a.nome)}" width="1200" height="750" loading="lazy" decoding="async"></section>` : '';
  const info = [['Vendedor', 'VisionX'], ['Categoria', a.setor], ['Plataforma', a.plat], a.site ? ['Site', a.site] : ['Situação', 'Aguardando aprovação da Apple']]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  return `${head(`${a.nome} — ${a.sub}`, a.texto, `/apps/${a.slug}/`, `/assets/apps/${a.cap || (a.caps && a.caps[0]) || a.icone}`)}
<body class="ap-body">
<main class="ap">
  <a class="ap-voltar" href="/" aria-label="Voltar ao início"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Início</span></a>
  <header class="ap-topo">
    ${icone(a, 'ap-ic--grande')}
    <div class="ap-tit">
      <h1>${esc(a.nome)}</h1>
      <p>${esc(a.sub)}</p>
      <div class="ap-acao">${cta}${a.url ? `<small>${a.site === 'App Store' ? 'App Store' : 'Site oficial'}</small>` : '<small>Para iPhone</small>'}</div>
    </div>
  </header>
  <div class="ap-chips">${chips}</div>
  ${cap}
  <section class="ap-sec"><h2>Sobre</h2><p class="ap-sobre">${esc(a.texto)}</p></section>
  <section class="ap-sec"><h2>Destaques</h2><ul class="ap-lista">${a.pontos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>
  <section class="ap-sec"><h2>Informações</h2><dl class="ap-info">${info}</dl></section>
  <footer class="ap-rodape"><span>© <span data-ano>${ANO}</span> Alexandre Henrique</span><a href="/">Ver todos os links</a></footer>
</main>
<script>document.querySelectorAll('[data-ano]').forEach(function(e){e.textContent=new Date().getFullYear()})</script>
</body>
</html>
`;
}

// ---- páginas
for (const a of apps) {
  mkdirSync(`apps/${a.slug}`, { recursive: true });
  writeFileSync(`apps/${a.slug}/index.html`, pagina(a));
}

// ---- trecho da home (faixa de ícones + janela com todos), entre marcadores
const FAIXA = 6;
const faixa = apps.slice(0, FAIXA).map((a) => `<a class="ap-mini" href="/apps/${a.slug}/" aria-label="${esc(a.nome)}" title="${esc(a.nome)}">${icone(a)}</a>`).join('');
const todos = apps.map((a) => `<a class="ap-item" href="/apps/${a.slug}/">${icone(a)}<span class="ap-item__nome">${esc(a.nome)}</span><small>${esc(a.setor)}</small></a>`).join('');
const bloco = `<!-- apps:inicio (gerado por ferramentas/gerar-apps.mjs) -->
      <section class="apps" aria-label="Meus sistemas">
        <h2 class="apps__tit">Meus sistemas</h2>
        <div class="apps__faixa">${faixa}</div>
        <button class="apps__todas" type="button" data-abrir-apps>Ver todas (${apps.length})</button>
      </section>
      <dialog class="apps-janela" id="apps-janela" aria-label="Todos os sistemas">
        <div class="apps-janela__topo"><h2>Meus sistemas</h2><button type="button" class="apps-janela__fechar" data-fechar-apps aria-label="Fechar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></div>
        <div class="apps-janela__grade">${todos}</div>
      </dialog>
      <!-- apps:fim -->`;
let home = readFileSync('index.html', 'utf8');
if (home.includes('<!-- apps:inicio')) home = home.replace(/<!-- apps:inicio[\s\S]*?<!-- apps:fim -->/, bloco);
else home = home.replace('      <!-- Preview do vídeo (por último)', `${bloco}\n\n      <!-- Preview do vídeo (por último)`);
if (!home.includes('apps/apps.css')) home = home.replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="apps/apps.css">');
writeFileSync('index.html', home);

// ---- sitemap
let sm = readFileSync('sitemap.xml', 'utf8');
sm = sm.replace(/\s*<url><loc>https:\/\/alexandreh\.com\/apps\/[^<]*<\/loc><\/url>/g, '');
sm = sm.replace('</urlset>', apps.map((a) => `  <url><loc>https://alexandreh.com/apps/${a.slug}/</loc></url>\n`).join('') + '</urlset>');
writeFileSync('sitemap.xml', sm);
console.log(`${apps.length} páginas em apps/, faixa com ${FAIXA}, home e sitemap atualizados`);

// ---- versão por conteúdo: o navegador nunca serve app.js/CSS velho junto com HTML novo
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
const hash = (f) => createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 8);
const v = { 'styles.css': hash('styles.css'), 'apps/apps.css': hash('apps/apps.css'), 'app.js': hash('app.js') };
const paginas = ['index.html', ...readdirSync('apps', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `apps/${d.name}/index.html`)];
for (const f of paginas) {
  let t = readFileSync(f, 'utf8');
  t = t.replace(/(href|src)="(\/?)(styles\.css|apps\/apps\.css|app\.js)(\?v=[a-f0-9]+)?"/g, (_, at, barra, nome) => `${at}="${barra}${nome}?v=${v[nome]}"`);
  writeFileSync(f, t);
}
console.log('versões:', JSON.stringify(v));
