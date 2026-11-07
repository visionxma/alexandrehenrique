import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as entrar, MENSAGEM } from '../functions/skills/api/membros/entrar.js';
import { onRequestPost as codigo } from '../functions/skills/api/membros/codigo.js';
import { onRequestGet as eu } from '../functions/skills/api/membros/eu.js';
import { onRequestPost as sair } from '../functions/skills/api/membros/sair.js';
import { onRequestGet as zip } from '../functions/skills/api/membros/zip.js';
import { onRequestPost as hook } from '../functions/skills/api/nuvpag.js';
import { criarSessao } from '../functions/skills/_lib/token.js';
import { ambiente, post, get, cookieDe, fetchFalso, comRelogio, HOOK, SEGREDO, SITE } from './mocks.mjs';

const EMAIL = 'cliente@exemplo.com';
let env, emails, esperas;
const ctx = (request, e = env) => ({ request, env: e, waitUntil: (p) => esperas.push(p) });

beforeEach(async () => {
  env = ambiente({ AMBIENTE: 'dev' });
  esperas = [];
  emails = fetchFalso(new Response('{"id":"1"}', { status: 200 }));
  await env.FAISCA.put(`pago:${EMAIL}`, JSON.stringify({ nome: 'Cliente', produto: 'Faísca', transacao: 't1', quando: 'x' }));
});

async function pedirCodigo(email = EMAIL, e = env, ip) {
  const r = await entrar(ctx(post('/skills/api/membros/entrar', { email }, { ip }), e));
  await Promise.all(esperas);
  return [r.status, await r.json()];
}
async function logar() {
  const [, j] = await pedirCodigo();
  const r = await codigo(ctx(post('/skills/api/membros/codigo', { email: EMAIL, codigo: j.codigoDev })));
  assert.equal(r.status, 200);
  return cookieDe(r);
}

test('entrar: e-mail pago e não pago recebem a MESMA resposta; só o pago gera código', async () => {
  const [stA, a] = await pedirCodigo(EMAIL);
  const [stB, b] = await pedirCodigo('ninguem@exemplo.com');
  assert.equal(stA, 200); assert.equal(stB, 200);
  assert.equal(a.msg, MENSAGEM); assert.equal(b.msg, MENSAGEM);
  assert.match(a.codigoDev, /^\d{6}$/, 'em dev o código volta');
  assert.equal(b.codigoDev, undefined);
  assert.ok(await env.FAISCA.get(`otp:${EMAIL}`));
  assert.equal(await env.FAISCA.get('otp:ninguem@exemplo.com'), null);
  const otp = JSON.parse(await env.FAISCA.get(`otp:${EMAIL}`));
  assert.ok(!JSON.stringify(otp).includes(a.codigoDev), 'só o hash fica guardado');
  assert.equal(env.FAISCA.ttlDe(`otp:${EMAIL}`), 600);
});

test('entrar em produção: nunca devolve o código, e envia pelo Resend com remetente e texto em português', async () => {
  const prod = { ...env, AMBIENTE: undefined, RESEND_API_KEY: 're_teste' };
  const [st, j] = await pedirCodigo(EMAIL, prod);
  assert.equal(st, 200); assert.equal(j.codigoDev, undefined); assert.deepEqual(Object.keys(j).sort(), ['msg', 'ok']);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].url, 'https://api.resend.com/emails');
  assert.equal(emails[0].op.headers.authorization, 'Bearer re_teste');
  const corpo = JSON.parse(emails[0].op.body);
  assert.equal(corpo.from, 'Faísca <oi@alexandreh.com>'); assert.deepEqual(corpo.to, [EMAIL]);
  assert.match(corpo.subject, /código de acesso/); assert.match(corpo.text, /\b\d{6}\b/);
  // AMBIENTE=prod também não devolve
  const [, j2] = await pedirCodigo(EMAIL, { ...env, AMBIENTE: 'prod' });
  assert.equal(j2.codigoDev, undefined);
});

test('entrar: e-mail mal escrito → 422; outra origem → 403', async () => {
  assert.equal((await pedirCodigo('isso não é e-mail'))[0], 422);
  assert.equal((await entrar(ctx(post('/skills/api/membros/entrar', { email: EMAIL }, { origem: 'https://mal.com' })))).status, 403);
});

test('entrar: limite de 5 por hora por e-mail e por IP', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await pedirCodigo(EMAIL, env, `1.1.1.${i}`))[0], 200);
  assert.equal((await pedirCodigo(EMAIL, env, '1.1.1.99'))[0], 429, '6º do mesmo e-mail');
  for (let i = 0; i < 5; i++) assert.equal((await pedirCodigo(`x${i}@exemplo.com`, env, '9.9.9.9'))[0], 200);
  assert.equal((await pedirCodigo('y@exemplo.com', env, '9.9.9.9'))[0], 429, '6º do mesmo IP');
});

test('código certo abre sessão com o cookie pedido e é de uso único', async () => {
  const [, j] = await pedirCodigo();
  const r = await codigo(ctx(post('/skills/api/membros/codigo', { email: EMAIL.toUpperCase(), codigo: j.codigoDev })));
  assert.equal(r.status, 200);
  const sc = r.headers.get('set-cookie');
  for (const p of ['faisca_sessao=', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/skills', 'Max-Age=2592000']) assert.ok(sc.includes(p), p);
  assert.equal(await env.FAISCA.get(`otp:${EMAIL}`), null, 'otp apagado');
  const de_novo = await codigo(ctx(post('/skills/api/membros/codigo', { email: EMAIL, codigo: j.codigoDev })));
  assert.equal(de_novo.status, 401, 'mesmo código não serve duas vezes');
  const r2 = await eu(ctx(get('/skills/api/membros/eu', cookieDe(r))));
  assert.equal(r2.status, 200); assert.deepEqual(await r2.json(), { ok: true, email: EMAIL, admin: false });
});

test('código errado conta tentativa; na 5ª o código morre, mesmo o certo depois', async () => {
  const [, j] = await pedirCodigo();
  const errado = j.codigoDev === '000000' ? '111111' : '000000';
  for (let i = 1; i <= 4; i++) {
    const r = await codigo(ctx(post('/skills/api/membros/codigo', { email: EMAIL, codigo: errado })));
    assert.equal(r.status, 401); assert.equal((await r.json()).restantes, 5 - i);
  }
  assert.equal((await codigo(ctx(post('/skills/api/membros/codigo', { email: EMAIL, codigo: errado })))).status, 429, '5ª errada');
  assert.equal((await codigo(ctx(post('/skills/api/membros/codigo', { email: EMAIL, codigo: j.codigoDev })))).status, 401, 'o certo não vale mais');
});

test('código vencido (10 min) não vale; código de um e-mail não serve em outro', async () => {
  const [, j] = await pedirCodigo();
  await env.FAISCA.put('pago:outro@exemplo.com', '{}');
  assert.equal((await codigo(ctx(post('/skills/api/membros/codigo', { email: 'outro@exemplo.com', codigo: j.codigoDev })))).status, 401);
  await comRelogio(601 * 1000, async () => {
    assert.equal((await codigo(ctx(post('/skills/api/membros/codigo', { email: EMAIL, codigo: j.codigoDev })))).status, 401);
  });
});

test('eu: sem cookie → 200 sem e-mail; cookie adulterado ou vencido → 401 e limpa o cookie', async () => {
  let r = await eu(ctx(get('/skills/api/membros/eu')));
  assert.equal(r.status, 200); assert.equal((await r.json()).email, null);
  const c = await logar();
  r = await eu(ctx(get('/skills/api/membros/eu', c.replace(/.$/, (x) => (x === 'A' ? 'B' : 'A')))));
  assert.equal(r.status, 401); assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
  const forjado = `faisca_sessao=${await criarSessao(EMAIL, 'outro-segredo')}`;
  assert.equal((await eu(ctx(get('/skills/api/membros/eu', forjado)))).status, 401);
  await comRelogio(31 * 24 * 3600 * 1000, async () => {
    assert.equal((await eu(ctx(get('/skills/api/membros/eu', c)))).status, 401);
  });
});

test('reembolso pelo webhook derruba a sessão na hora', async () => {
  const c = await logar();
  assert.equal((await eu(ctx(get('/skills/api/membros/eu', c)))).status, 200);
  const r = await hook({ request: new Request(`${SITE}/skills/api/nuvpag`, { method: 'POST', headers: { 'x-webhook-secret': HOOK, 'content-type': 'application/json' }, body: JSON.stringify({ event: 'refunded', data: { customer: { email: EMAIL } } }) }), env });
  assert.equal(r.status, 200);
  const r2 = await eu(ctx(get('/skills/api/membros/eu', c)));
  assert.equal(r2.status, 401); assert.match(r2.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await zip(ctx(get('/skills/api/membros/zip?todas=1', c)))).status, 401);
  // e não consegue pedir código novo que funcione
  const [, j] = await pedirCodigo();
  assert.equal(j.codigoDev, undefined);
});

test('sair limpa o cookie', async () => {
  const r = await sair(ctx(post('/skills/api/membros/sair', {})));
  assert.equal(r.status, 200); assert.match(r.headers.get('set-cookie'), /^faisca_sessao=;.*Max-Age=0/);
});

test('download protegido: sem sessão 401, com sessão 200 em fluxo, id malicioso 404', async () => {
  const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 9, 9]);
  await env.ZIPS.put('skills/documentos-e-texto/humanizer.zip', bytes);
  await env.ZIPS.put('categorias/seo-e-geo.zip', bytes);
  await env.ZIPS.put('todas.zip', bytes);
  assert.equal((await zip(ctx(get('/skills/api/membros/zip?s=humanizer')))).status, 401);
  const c = await logar();
  for (const [q, nome] of [['s=humanizer', 'humanizer.zip'], ['cat=seo-e-geo', 'faisca-seo-e-geo.zip'], ['todas=1', 'faisca-todas-as-skills.zip']]) {
    const r = await zip(ctx(get(`/skills/api/membros/zip?${q}`, c)));
    assert.equal(r.status, 200, q);
    assert.equal(r.headers.get('content-type'), 'application/zip');
    assert.equal(r.headers.get('content-disposition'), `attachment; filename="${nome}"`);
    assert.ok(r.body instanceof ReadableStream, 'entrega em fluxo');
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes);
  }
  for (const q of ['s=../../todas', 's=..%2F..%2Ftodas', 's=humanizer/../x', 's=__proto__', 's=constructor', 'cat=../skills', 'cat=__proto__', 'todas=sim', '', 's=nao-existe'])
    assert.equal((await zip(ctx(get(`/skills/api/membros/zip?${q}`, c)))).status, 404, q);
  // existe no catálogo mas não está no R2 → 404
  assert.equal((await zip(ctx(get('/skills/api/membros/zip?s=brainstorming', c)))).status, 404);
});

test('cookie de um segredo não abre sessão em outro (troca do SESSAO_SEGREDO derruba todos)', async () => {
  const c = await logar();
  assert.equal((await eu(ctx(get('/skills/api/membros/eu', c), { ...env, SESSAO_SEGREDO: SEGREDO + '2' }))).status, 401);
});
