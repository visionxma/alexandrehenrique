import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as lead } from '../functions/skills/api/lead.js';
import { onRequestGet as gratis } from '../functions/skills/api/gratis.js';
import { GRATIS } from '../functions/skills/_lib/gratis.js';
import { ambiente, post, get, fetchFalso, comRelogio, SITE } from './mocks.mjs';

const BOM = { nome: 'Maria da Silva', telefone: '(19) 99524-4237', skill: 'humanizer', turnstile: 'tok-real', aceito: true, hp: '' };
let env, turnstile;
beforeEach(() => {
  env = ambiente();
  turnstile = fetchFalso(new Response(JSON.stringify({ success: true }), { status: 200 }));
});

const corpo = async (r) => [r.status, await r.json()];

test('as 5 skills grátis estão embutidas e são zip', () => {
  assert.deepEqual(Object.keys(GRATIS).sort(), ['brainstorming', 'code-review', 'humanizer', 'systematic-debugging', 'todas', 'ui-ux-pro-max']);
  assert.equal(GRATIS.todas.arquivo, 'faisca-5-skills-gratis.zip');
  for (const [id, z] of Object.entries(GRATIS)) assert.equal(atob(z.base64.slice(0, 4)).slice(0, 2), 'PK', id);
});

test('fluxo feliz: grava o lead, confere Turnstile e o link baixa o zip', async () => {
  const [st, j] = await corpo(await lead({ request: post('/skills/api/lead', BOM, { cabecalhos: { 'user-agent': 'Teste/1' } }), env }));
  assert.equal(st, 200); assert.equal(j.ok, true);
  assert.match(j.url, /^\/skills\/api\/gratis\?s=humanizer&t=[a-f0-9-]+\.\d+\.[A-Za-z0-9_-]+$/);
  // Turnstile foi chamado com o segredo
  assert.equal(turnstile.length, 1);
  assert.equal(turnstile[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(turnstile[0].op.body.get('secret'), 'turnstile-secreto');
  assert.equal(turnstile[0].op.body.get('response'), 'tok-real');
  // lead gravado com os campos pedidos e telefone normalizado
  const [k] = env.FAISCA.chaves('lead:');
  const l = JSON.parse(await env.FAISCA.get(k));
  assert.deepEqual(Object.keys(l).sort(), ['ipHash', 'nome', 'quando', 'skill', 'telefone', 'ua']);
  assert.equal(l.telefone, '+5519995244237'); assert.equal(l.nome, 'Maria da Silva'); assert.equal(l.ua, 'Teste/1');
  assert.notEqual(l.ipHash, '200.1.2.3');
  // o link entrega o zip
  const dl = await gratis({ request: get(j.url), env });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'application/zip');
  assert.equal(dl.headers.get('content-disposition'), 'attachment; filename="humanizer.zip"');
  const b = new Uint8Array(await dl.arrayBuffer());
  assert.equal(String.fromCharCode(b[0], b[1]), 'PK');
});

test('dedupe: mesmo telefone em outro formato não cria lead novo', async () => {
  await lead({ request: post('/skills/api/lead', BOM), env });
  const [st, j] = await corpo(await lead({ request: post('/skills/api/lead', { ...BOM, telefone: '+55 19 99524-4237', skill: 'brainstorming' }), env }));
  assert.equal(st, 200); assert.match(j.url, /s=brainstorming/);
  assert.equal(env.FAISCA.chaves('lead:').length, 1);
  assert.equal(env.FAISCA.chaves('tel:').length, 1);
  assert.ok(!env.FAISCA.chaves('tel:')[0].includes('99524'), 'telefone não aparece na chave');
});

test('validação recusa e não grava nada', async () => {
  for (const [campo, mudanca] of [
    ['nome', { nome: 'Maria' }],
    ['telefone', { telefone: '(20) 99524-4237' }],
    ['telefone', { telefone: '(11) 91111-1111' }],
    ['telefone', { telefone: '(11) 91234-5678' }],
    ['telefone', { telefone: '(11) 3456-7890' }],
    ['aceito', { aceito: false }],
    ['aceito', { aceito: 'true' }],
    ['skill', { skill: 'frontend-design' }],
    ['skill', { skill: '../../segredo' }],
  ]) {
    const [st, j] = await corpo(await lead({ request: post('/skills/api/lead', { ...BOM, ...mudanca }), env }));
    assert.equal(st, 422, JSON.stringify(mudanca)); assert.equal(j.campo, campo);
  }
  assert.equal(env.FAISCA.chaves('lead:').length, 0);
});

test('isca (hp) preenchida: 200 falso, nada gravado, Turnstile nem chamado', async () => {
  const [st, j] = await corpo(await lead({ request: post('/skills/api/lead', { ...BOM, hp: 'http://spam' }), env }));
  assert.equal(st, 200); assert.equal(j.ok, true); assert.equal(j.url, null);
  assert.equal(env.FAISCA.m.size, 0); assert.equal(turnstile.length, 0);
});

test('Turnstile recusado ou ausente: 400 sem gravar; "dev-ok" só passa em dev', async () => {
  fetchFalso(new Response(JSON.stringify({ success: false }), { status: 200 }));
  let [st] = await corpo(await lead({ request: post('/skills/api/lead', BOM), env }));
  assert.equal(st, 400);
  [st] = await corpo(await lead({ request: post('/skills/api/lead', { ...BOM, turnstile: '' }), env }));
  assert.equal(st, 400);
  [st] = await corpo(await lead({ request: post('/skills/api/lead', { ...BOM, turnstile: 'dev-ok' }), env }));
  assert.equal(st, 400, 'dev-ok em produção vai à Cloudflare e é recusado');
  [st] = await corpo(await lead({ request: post('/skills/api/lead', { ...BOM, turnstile: 'dev-ok' }), env: { ...env, AMBIENTE: 'prod' } }));
  assert.equal(st, 400);
  assert.equal(env.FAISCA.chaves('lead:').length, 0);
  const chamadas = fetchFalso(() => { throw new Error('não deveria chamar'); });
  [st] = await corpo(await lead({ request: post('/skills/api/lead', { ...BOM, turnstile: 'dev-ok' }), env: { ...env, AMBIENTE: 'dev' } }));
  assert.equal(st, 200); assert.equal(chamadas.length, 0);
});

test('limite: 5 por hora por IP e por telefone', async () => {
  const tels = ['(11) 98877-6655', '(21) 97766-5544', '(31) 96655-4433', '(41) 95544-3322', '(51) 94433-2211', '(61) 93322-1100'];
  for (let i = 0; i < 5; i++) assert.equal((await lead({ request: post('/skills/api/lead', { ...BOM, telefone: tels[i] }), env })).status, 200, `ip ${i}`);
  assert.equal((await lead({ request: post('/skills/api/lead', { ...BOM, telefone: tels[5] }), env })).status, 429, '6º do mesmo IP');
  // mesmo telefone, IPs diferentes
  for (let i = 0; i < 5; i++) assert.equal((await lead({ request: post('/skills/api/lead', BOM, { ip: `10.0.0.${i}` }), env })).status, 200, `tel ${i}`);
  assert.equal((await lead({ request: post('/skills/api/lead', BOM, { ip: '10.0.0.99' }), env })).status, 429, '6º do mesmo telefone');
  // uma hora depois volta a passar
  await comRelogio(3700 * 1000, async () => {
    assert.equal((await lead({ request: post('/skills/api/lead', BOM, { ip: '10.0.0.99' }), env })).status, 200);
  });
  // chave do limite não guarda IP nem telefone puros
  assert.ok(env.FAISCA.chaves('lim:').every((k) => !k.includes('10.0.0') && !k.includes('99524')));
});

test('origem: outro site ou sem Origin → 403; JSON ruim → 400; sem configuração → 503', async () => {
  assert.equal((await lead({ request: post('/skills/api/lead', BOM, { origem: 'https://outro.com' }), env })).status, 403);
  assert.equal((await lead({ request: post('/skills/api/lead', BOM, { origem: null }), env })).status, 403);
  assert.equal((await lead({ request: post('/skills/api/lead', '{quebrado'), env })).status, 400);
  assert.equal((await lead({ request: post('/skills/api/lead', BOM), env: { FAISCA: env.FAISCA } })).status, 503);
});

test('download grátis: sem token, adulterado, skill trocada, vencido e skill fora da lista', async () => {
  const j = await (await lead({ request: post('/skills/api/lead', BOM), env })).json();
  const t = new URL(SITE + j.url).searchParams.get('t');
  assert.equal((await gratis({ request: get('/skills/api/gratis?s=humanizer'), env })).status, 403);
  assert.equal((await gratis({ request: get(`/skills/api/gratis?s=humanizer&t=${t.slice(0, -1)}${t.endsWith('A') ? 'B' : 'A'}`), env })).status, 403);
  assert.equal((await gratis({ request: get(`/skills/api/gratis?s=brainstorming&t=${t}`), env })).status, 403, 'token de outra skill');
  assert.equal((await gratis({ request: get(`/skills/api/gratis?s=frontend-design&t=${t}`), env })).status, 404, 'skill paga');
  assert.equal((await gratis({ request: get(`/skills/api/gratis?s=../../etc&t=${t}`), env })).status, 404);
  assert.equal((await gratis({ request: get(`/skills/api/gratis?s=__proto__&t=${t}`), env })).status, 404);
  await comRelogio(11 * 60 * 1000, async () => {
    assert.equal((await gratis({ request: get(j.url), env })).status, 410);
  });
});

test('"todas": lead devolve url, /gratis entrega o zip com as 5 pastas, LEIA-ME e NOTICES', async () => {
  const [st, j] = await corpo(await lead({ request: post('/skills/api/lead', { ...BOM, skill: 'todas' }), env }));
  assert.equal(st, 200); assert.match(j.url, /^\/skills\/api\/gratis\?s=todas&t=[a-f0-9-]+\.\d+\.[A-Za-z0-9_-]+$/);
  const dl = await gratis({ request: get(j.url), env });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'application/zip');
  assert.equal(dl.headers.get('content-disposition'), 'attachment; filename="faisca-5-skills-gratis.zip"');
  const b = Buffer.from(await dl.arrayBuffer());
  assert.equal(b.subarray(0, 2).toString(), 'PK');
  // os nomes ficam sem compressão no diretório central do zip
  const nomes = b.toString('latin1');
  for (const id of ['systematic-debugging', 'brainstorming', 'humanizer', 'code-review', 'ui-ux-pro-max']) {
    assert.ok(nomes.includes(`faisca-5-skills-gratis/${id}/SKILL.md`), id);
    assert.ok(nomes.includes(`faisca-5-skills-gratis/${id}/LICENSE`), `${id} LICENSE`);
    assert.ok(!nomes.includes(`faisca-5-skills-gratis/${id}/${id}/`), `${id} sem pasta repetida`);
  }
  assert.ok(nomes.includes('faisca-5-skills-gratis/LEIA-ME.md'));
  assert.ok(nomes.includes('faisca-5-skills-gratis/NOTICES.md'));
});

test('token de "todas" não vale para outra skill, e o de outra skill não vale para "todas"', async () => {
  const jt = await (await lead({ request: post('/skills/api/lead', { ...BOM, skill: 'todas' }), env })).json();
  const tTodas = new URL(SITE + jt.url).searchParams.get('t');
  const jh = await (await lead({ request: post('/skills/api/lead', { ...BOM, skill: 'humanizer' }), env })).json();
  const tHum = new URL(SITE + jh.url).searchParams.get('t');
  assert.equal((await gratis({ request: get(`/skills/api/gratis?s=humanizer&t=${tTodas}`), env })).status, 403);
  assert.equal((await gratis({ request: get(`/skills/api/gratis?s=todas&t=${tHum}`), env })).status, 403);
  assert.equal((await gratis({ request: get(`/skills/api/gratis?s=todas&t=${tTodas}`), env })).status, 200);
  assert.equal((await gratis({ request: get(`/skills/api/gratis?s=frontend-design&t=${tTodas}`), env })).status, 404, 'skill paga segue 404');
  assert.equal((await gratis({ request: get(`/skills/api/gratis?s=Todas&t=${tTodas}`), env })).status, 404);
});
