import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as entrar, MENSAGEM } from '../functions/skills/api/membros/entrar.js';
import { onRequestPost as codigo } from '../functions/skills/api/membros/codigo.js';
import { onRequestGet as eu } from '../functions/skills/api/membros/eu.js';
import { onRequestGet as admin } from '../functions/skills/api/membros/admin.js';
import { ehAdmin, ADMINS } from '../functions/skills/_lib/admin.js';
import { membroAtivo } from '../functions/skills/_lib/sessao.js';
import { diaSP } from '../functions/skills/_lib/metricas.js';
import { onRequestPost as lead } from '../functions/skills/api/lead.js';
import { onRequestPost as hook } from '../functions/skills/api/nuvpag.js';
import { MAX_GETS } from '../functions/skills/api/membros/admin.js';
import { ambiente, post, get, cookieDe, fetchFalso, KVFalso, HOOK } from './mocks.mjs';

const ADM = 'visionxma@gmail.com';
const COMPRADOR = 'cliente@exemplo.com';
let env, esperas;
const ctx = (request, e = env) => ({ request, env: e, waitUntil: (p) => esperas.push(p) });

// KV que obedece limit e cursor, para provar a paginação (páginas de 2 chaves, qualquer que seja o limit pedido).
class KVPaginado extends KVFalso {
  constructor(porPagina = 2) { super(); this.porPagina = porPagina; this.paginas = 0; }
  async list({ prefix = '', limit = 1000, cursor } = {}) {
    this.paginas++;
    const todas = this.chaves(prefix).sort();
    const ini = cursor ? Number(cursor) : 0;
    const n = Math.min(limit, this.porPagina);
    const fatia = todas.slice(ini, ini + n);
    const fim = ini + n >= todas.length;
    return { keys: fatia.map((name) => ({ name })), list_complete: fim, ...(fim ? {} : { cursor: String(ini + n) }) };
  }
}

const guardar = (kv, chave, v) => kv.put(chave, JSON.stringify(v));

beforeEach(async () => {
  env = ambiente({ AMBIENTE: 'dev' });
  esperas = [];
  fetchFalso(new Response('{"id":"1"}', { status: 200 }));
  await guardar(env.FAISCA, `pago:${COMPRADOR}`, { nome: 'Cliente', produto: 'Faísca', transacao: 't1', quando: '2026-11-01T10:00:00.000Z' });
});

async function pedirCodigo(email, e = env) {
  const r = await entrar(ctx(post('/skills/api/membros/entrar', { email }), e));
  await Promise.all(esperas);
  return [r.status, await r.json()];
}
async function logar(email, e = env) {
  const [, j] = await pedirCodigo(email, e);
  const r = await codigo(ctx(post('/skills/api/membros/codigo', { email, codigo: j.codigoDev }), e));
  assert.equal(r.status, 200, `login de ${email}`);
  return cookieDe(r);
}
const chamar = (fn, caminho, cookie, e = env) => fn(ctx(get(caminho, cookie), e));

test('ehAdmin: só o e-mail da lista; normaliza; qualquer outro valor é false', () => {
  assert.deepEqual(ADMINS, [ADM]);
  assert.equal(ehAdmin(ADM), true);
  assert.equal(ehAdmin('  VisionXMA@Gmail.com '), true);
  for (const v of ['outro@gmail.com', 'visionxma@gmail.com.br', 'xvisionxma@gmail.com', '', null, undefined, 42, {}, [ADM], ['visionxma@gmail.com']]) assert.equal(ehAdmin(v), false, String(v));
});

test('entrar: admin sem compra recebe código; a resposta é a mesma de qualquer outro e-mail', async () => {
  assert.equal(await env.FAISCA.get(`pago:${ADM}`), null, 'admin não tem compra');
  const [stA, a] = await pedirCodigo(ADM);
  const [stB, b] = await pedirCodigo('ninguem@exemplo.com');
  assert.equal(stA, 200); assert.equal(stB, 200);
  assert.equal(a.msg, MENSAGEM); assert.equal(b.msg, MENSAGEM);
  assert.match(a.codigoDev, /^\d{6}$/);
  assert.ok(await env.FAISCA.get(`otp:${ADM}`));
  // A resposta não revela quem é admin: mesmas chaves, mesma mensagem.
  const { codigoDev: _a, ...semA } = a; const { codigoDev: _b, ...semB } = b;
  assert.deepEqual(semA, semB);
});

test('entrar: não-admin sem compra segue sem código (inclusive e-mail parecido com o do admin)', async () => {
  for (const email of ['ninguem@exemplo.com', 'visionxma@gmail.com.br', 'visionxma+x@gmail.com']) {
    const [st, j] = await pedirCodigo(email);
    assert.equal(st, 200); assert.equal(j.codigoDev, undefined, email);
    assert.equal(await env.FAISCA.get(`otp:${email}`), null, email);
  }
});

test('código: admin sem compra abre sessão; não-admin sem compra continua barrado', async () => {
  const cookie = await logar(ADM);
  assert.match(cookie, /^faisca_sessao=.+/);
  // não-admin que tinha otp mas a compra sumiu → inválido (comportamento antigo)
  const [, j] = await pedirCodigo(COMPRADOR);
  await env.FAISCA.delete(`pago:${COMPRADOR}`);
  const r = await codigo(ctx(post('/skills/api/membros/codigo', { email: COMPRADOR, codigo: j.codigoDev })));
  assert.equal(r.status, 401);
});

test('sessão: admin continua ativo sem pago:; comprador cai quando pago: some', async () => {
  const cAdm = await logar(ADM);
  const cCli = await logar(COMPRADOR);
  assert.equal((await membroAtivo(get('/x', cAdm), env))?.email, ADM);
  assert.equal((await membroAtivo(get('/x', cCli), env))?.email, COMPRADOR);
  await env.FAISCA.delete(`pago:${COMPRADOR}`);
  assert.equal(await membroAtivo(get('/x', cCli), env), null);
  assert.equal((await membroAtivo(get('/x', cAdm), env))?.email, ADM);
});

test('eu: admin true, comprador false, sem cookie continua { ok:true, email:null }', async () => {
  const cAdm = await logar(ADM);
  const cCli = await logar(COMPRADOR);
  assert.deepEqual(await (await chamar(eu, '/skills/api/membros/eu', cAdm)).json(), { ok: true, email: ADM, admin: true });
  assert.deepEqual(await (await chamar(eu, '/skills/api/membros/eu', cCli)).json(), { ok: true, email: COMPRADOR, admin: false });
  assert.deepEqual(await (await chamar(eu, '/skills/api/membros/eu')).json(), { ok: true, email: null });
});

test('admin: 401 sem sessão (e com cookie lixo), 403 para comprador comum, sem vazar dado', async () => {
  const semCookie = await chamar(admin, '/skills/api/membros/admin');
  assert.equal(semCookie.status, 401);
  assert.equal((await semCookie.json()).ok, false);
  assert.equal((await chamar(admin, '/skills/api/membros/admin', 'faisca_sessao=lixo')).status, 401);
  assert.equal((await chamar(admin, '/skills/api/membros/admin?parte=funil')).status, 401);
  assert.equal((await chamar(admin, '/skills/api/membros/admin?parte=funil', await logar(COMPRADOR))).status, 403);

  await guardar(env.FAISCA, 'lead:l1', { nome: 'Ana Lead', telefone: '+5511999990001', skill: 'todas', quando: '2026-11-02T10:00:00.000Z', ipHash: 'HASH', ua: 'UA' });
  const r = await chamar(admin, '/skills/api/membros/admin', await logar(COMPRADOR));
  assert.equal(r.status, 403);
  const txt = await r.text();
  assert.deepEqual(JSON.parse(txt), { ok: false, msg: 'Acesso restrito.' });
  for (const segredo of ['Ana Lead', '5511999990001', COMPRADOR, 'HASH']) assert.ok(!txt.includes(segredo), `403 não pode conter ${segredo}`);
});

test('admin: 200 com leads e compras ordenados do mais recente, sem ipHash/ua, no-store', async () => {
  const kv = env.FAISCA;
  await guardar(kv, 'lead:a', { nome: 'Antiga', telefone: '+5511900000001', skill: 'todas', quando: '2026-10-01T10:00:00.000Z', ipHash: 'IPH1', ua: 'Mozilla/ruim' });
  await guardar(kv, 'lead:b', { nome: 'Nova', telefone: '+5521900000002', skill: 'copy', quando: '2026-11-05T10:00:00.000Z', ipHash: 'IPH2', ua: 'Mozilla/ruim' });
  await guardar(kv, 'lead:c', { nome: 'Meio', telefone: '+5531900000003', skill: 'seo', quando: '2026-10-20T10:00:00.000Z', ipHash: 'IPH3', ua: 'x' });
  await guardar(kv, 'pago:velho@exemplo.com', { nome: 'Velho', produto: 'Faísca', transacao: 'tv', quando: '2026-09-01T10:00:00.000Z' });
  await guardar(kv, 'pago:Novo@Exemplo.com', { nome: 'Novo', produto: 'Faísca', transacao: 'tn', quando: '2026-11-06T10:00:00.000Z' });
  const r = await chamar(admin, '/skills/api/membros/admin', await logar(ADM));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const txt = await r.text();
  assert.ok(!/ipHash|IPH\d|"ua"|Mozilla/.test(txt), 'sem ipHash nem ua');
  const j = JSON.parse(txt);
  assert.equal(j.ok, true);
  assert.deepEqual(j.leads.map((l) => l.id), ['b', 'c', 'a']);
  assert.deepEqual(Object.keys(j.leads[0]).sort(), ['id', 'nome', 'quando', 'skill', 'telefone']);
  assert.equal(j.leads[0].telefone, '+5521900000002', 'telefone sai como veio');
  assert.deepEqual(j.compras.map((c) => c.email), ['novo@exemplo.com', COMPRADOR, 'velho@exemplo.com']);
  assert.deepEqual(Object.keys(j.compras[0]).sort(), ['email', 'nome', 'produto', 'quando', 'transacao']);
  assert.deepEqual(j.totais, { leads: 3, compras: 3 });
  assert.equal(j.funil, undefined, 'a resposta padrão não traz o funil');
  assert.deepEqual(Object.keys(j).sort(), ['compras', 'leads', 'ok', 'totais']);
  assert.ok(j.leads.every((l) => l.incompleto === undefined), 'legado lido por get não é incompleto');
});

test('admin: funil soma os últimos 7 dias e ignora o que é mais velho; sem métrica vira zeros', async () => {
  const kv = env.FAISCA;
  const cookie = await logar(ADM);
  const vazio = await (await chamar(admin, '/skills/api/membros/admin?parte=funil', cookie)).json();
  assert.deepEqual(vazio.funil, { dias: 7, visita: 0, abre_baixar: 0, baixou_gratis: 0, clique_painel: 0, clique_comprar: 0, compra_aprovada: 0, reembolso: 0 });
  const hoje = diaSP();
  await kv.put(`m:${hoje}:visita`, '10');
  await kv.put(`m:${diaSP(Date.now() - 3 * 86400000)}:visita`, '5');
  await kv.put(`m:${diaSP(Date.now() - 20 * 86400000)}:visita`, '999');
  await kv.put(`m:${hoje}:compra_aprovada`, '2');
  const j = await (await chamar(admin, '/skills/api/membros/admin?parte=funil', cookie)).json();
  assert.deepEqual(Object.keys(j).sort(), ['funil', 'ok'], '?parte=funil traz só o funil');
  assert.equal(j.funil.visita, 15);
  assert.equal(j.funil.compra_aprovada, 2);
  assert.equal(j.funil.dias, 7);
});

test('admin: métrica que falha não quebra a resposta', async () => {
  const cookie = await logar(ADM);
  const get0 = env.FAISCA.get.bind(env.FAISCA);
  env.FAISCA.get = async (k, t) => { if (k.startsWith('m:')) throw new Error('KV caiu'); return get0(k, t); };
  const r = await chamar(admin, '/skills/api/membros/admin?parte=funil', cookie);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.funil.visita, 0);
});

test('admin: pagina o list do KV (várias páginas) e respeita o teto de 1000 itens', async () => {
  const kv = new KVPaginado(2);
  env = ambiente({ AMBIENTE: 'dev', FAISCA: kv });
  for (let i = 1; i <= 5; i++) await guardar(kv, `lead:l${i}`, { nome: `L${i}`, telefone: `+55119000000${i}0`, skill: 'todas', quando: `2026-11-0${i}T10:00:00.000Z` });
  const cookie = await logar(ADM);
  kv.paginas = 0;
  const j = await (await chamar(admin, '/skills/api/membros/admin', cookie)).json();
  assert.equal(j.totais.leads, 5, 'leu as 3 páginas de leads');
  assert.deepEqual(j.leads.map((l) => l.id), ['l5', 'l4', 'l3', 'l2', 'l1']);
  assert.ok(kv.paginas >= 3, `páginas lidas: ${kv.paginas}`);

  // teto: 1200 leads → no máximo 1000 na resposta, em até 5 páginas
  const grande = new KVPaginado(300);
  env = ambiente({ AMBIENTE: 'dev', FAISCA: grande });
  for (let i = 0; i < 1200; i++) await guardar(grande, `lead:g${String(i).padStart(4, '0')}`, { nome: `G${i}`, telefone: '+5511900000000', skill: 'todas', quando: '2026-11-01T10:00:00.000Z' });
  const c2 = await logar(ADM);
  const g = await (await chamar(admin, '/skills/api/membros/admin', c2)).json();
  assert.equal(g.leads.length, 1000);
  assert.equal(g.totais.leads, 1000);
  assert.equal(g.leads.filter((l) => !l.incompleto).length, MAX_GETS, 'só MAX_GETS leituras do legado');
});

test('admin: com metadata não faz nenhum get; legado só até MAX_GETS e o resto vem incompleto', async () => {
  const kv = new KVFalso();
  env = ambiente({ AMBIENTE: 'dev', FAISCA: kv });
  const N = 120;
  for (let i = 0; i < N; i++) {
    const q = new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString();
    await kv.put(`lead:m${String(i).padStart(3, '0')}`, JSON.stringify({ nome: 'NAO-LER', telefone: 'NAO-LER', skill: 'todas', quando: q, ipHash: 'H', ua: 'U' }), { metadata: { n: `Meta ${i}`, t: `+55119000${String(i).padStart(5, '0')}`, s: 'todas', q } });
  }
  await kv.put('pago:meta@exemplo.com', JSON.stringify({ nome: 'NAO-LER', produto: 'x', transacao: 'x', quando: '2026-11-04T00:00:00.000Z' }), { metadata: { n: 'Compra Meta', p: 'Faísca', x: 'tm', q: '2026-11-04T00:00:00.000Z' } });
  const cookie = await logar(ADM);
  const get0 = kv.get.bind(kv); let gets = 0;
  kv.get = async (k, t) => { gets++; return get0(k, t); };

  gets = 0;
  const j = await (await chamar(admin, '/skills/api/membros/admin', cookie)).json();
  assert.equal(gets, 0, `com metadata não pode haver get (houve ${gets})`);
  assert.equal(j.totais.leads, N);
  assert.equal(j.leads[0].nome, `Meta ${N - 1}`, 'ordem por quando (da metadata)');
  assert.equal(j.leads[0].telefone, `+55119000${String(N - 1).padStart(5, '0')}`);
  assert.deepEqual(Object.keys(j.leads[0]).sort(), ['id', 'nome', 'quando', 'skill', 'telefone']);
  assert.deepEqual(j.compras, [{ email: 'meta@exemplo.com', nome: 'Compra Meta', produto: 'Faísca', transacao: 'tm', quando: '2026-11-04T00:00:00.000Z' }]);
  assert.ok(!JSON.stringify(j).includes('NAO-LER') && !/ipHash|"ua"/.test(JSON.stringify(j)));

  // legado: 100 leads sem metadata → só MAX_GETS lidos; o resto sai sem nome, quando vazio, incompleto:true
  for (let i = 0; i < 100; i++) await kv.put(`lead:z${String(i).padStart(3, '0')}`, JSON.stringify({ nome: `Velho ${i}`, telefone: '+5511900000000', skill: 'todas', quando: '2026-09-01T00:00:00.000Z', ipHash: 'H', ua: 'U' }));
  await kv.put('pago:velha@exemplo.com', JSON.stringify({ nome: 'Velha', produto: 'Faísca', transacao: 'tv', quando: '2026-08-01T00:00:00.000Z' }));
  gets = 0;
  const k = await (await chamar(admin, '/skills/api/membros/admin', cookie)).json();
  assert.equal(gets, MAX_GETS, `exatamente o teto de gets (${gets})`);
  assert.equal(k.totais.leads, N + 100);
  const velhos = k.leads.filter((l) => l.id.startsWith('z'));
  assert.equal(velhos.length, 100);
  const lidos = velhos.filter((l) => !l.incompleto), incompletos = velhos.filter((l) => l.incompleto === true);
  assert.equal(incompletos.length, 100 - (MAX_GETS - 1), 'compras (legado) leram 1 get primeiro; o resto do orçamento foi para leads');
  assert.ok(lidos.every((l) => /^Velho \d+$/.test(l.nome) && l.quando));
  assert.ok(incompletos.every((l) => l.nome === '' && l.quando === '' && l.telefone === ''));
  assert.equal(k.compras.find((c) => c.email === 'velha@exemplo.com').nome, 'Velha', 'compra legada lida primeiro');
  assert.deepEqual(k.leads.slice(-incompletos.length).map((l) => l.incompleto), incompletos.map(() => true), 'incompletos vão para o fim');
});

test('lead.js e nuvpag.js gravam metadata (valor e resposta intactos, metadata < 1 KB)', async () => {
  fetchFalso(new Response(JSON.stringify({ success: true }), { status: 200 }));
  const r = await lead({ request: post('/skills/api/lead', { nome: 'Maria Aparecida dos Santos Albuquerque Cavalcanti de Oliveira Souza Lima', telefone: '(19) 99524-4237', skill: 'humanizer', turnstile: 'tok-real', aceito: true, hp: '' }), env });
  assert.equal(r.status, 200);
  const [kl] = env.FAISCA.chaves('lead:');
  const valor = JSON.parse(await env.FAISCA.get(kl));
  assert.deepEqual(Object.keys(valor).sort(), ['ipHash', 'nome', 'quando', 'skill', 'telefone', 'ua'], 'valor guardado não mudou');
  const ml = env.FAISCA.metadataDe(kl);
  assert.deepEqual(Object.keys(ml).sort(), ['n', 'q', 's', 't']);
  assert.equal(ml.t, '+5519995244237'); assert.equal(ml.s, 'humanizer'); assert.equal(ml.q, valor.quando); assert.ok(ml.n.length <= 60);
  assert.ok(!JSON.stringify(ml).includes(valor.ipHash));

  const h = await hook({ request: new Request('https://alexandreh.com/skills/api/nuvpag', { method: 'POST', headers: { 'x-webhook-secret': HOOK, 'content-type': 'application/json' }, body: JSON.stringify({ event: 'purchase_approved', data: { id: 'T-9', customer: { email: 'Novo@Exemplo.com', name: 'Fulano '.repeat(30) }, product: { name: 'Faísca' } } }) }), env });
  assert.equal(h.status, 200); assert.deepEqual(await h.json(), { ok: true, acao: 'liberado' });
  const mp = env.FAISCA.metadataDe('pago:novo@exemplo.com');
  assert.deepEqual(Object.keys(mp).sort(), ['n', 'p', 'q', 'x']);
  assert.equal(mp.p, 'Faísca'); assert.equal(mp.x, 'T-9'); assert.ok(mp.n.length <= 60);
  const vp = JSON.parse(await env.FAISCA.get('pago:novo@exemplo.com'));
  assert.deepEqual(Object.keys(vp).sort(), ['nome', 'produto', 'quando', 'transacao']);
  assert.equal(mp.q, vp.quando);
});

test('telefone e e-mail só aparecem na resposta do admin (nem em /eu de comprador, nem em /entrar)', async () => {
  await guardar(env.FAISCA, 'lead:z', { nome: 'Zeca', telefone: '+5585988887777', skill: 'todas', quando: '2026-11-03T10:00:00.000Z' });
  const cCli = await logar(COMPRADOR);
  const outros = [
    await (await chamar(eu, '/skills/api/membros/eu', cCli)).text(),
    JSON.stringify((await pedirCodigo('ninguem@exemplo.com'))[1]),
    await (await chamar(admin, '/skills/api/membros/admin', cCli)).text(),
    await (await chamar(admin, '/skills/api/membros/admin')).text(),
  ];
  for (const t of outros) assert.ok(!t.includes('5585988887777') && !t.includes('Zeca'), 'telefone/nome do lead vazou');
  const doAdmin = await (await chamar(admin, '/skills/api/membros/admin', await logar(ADM))).text();
  assert.ok(doAdmin.includes('+5585988887777') && doAdmin.includes(COMPRADOR));
});

test('admin: sem KV ou sem segredo → 503', async () => {
  assert.equal((await chamar(admin, '/skills/api/membros/admin', null, { ...env, FAISCA: undefined })).status, 503);
});
