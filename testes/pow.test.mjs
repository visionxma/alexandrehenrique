import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarDesafio, conferirDesafio, zerosAEsquerda, BITS_POW, VALIDADE_DESAFIO_MS } from '../functions/skills/_lib/pow.js';
import { onRequestGet as desafioGet } from '../functions/skills/api/desafio.js';
import { onRequestPost as lead } from '../functions/skills/api/lead.js';
import { solve } from '../ferramentas/solver-pow.mjs';
import { ambiente, post, get, fetchFalso, comRelogio, SEGREDO, SITE } from './mocks.mjs';

const BASE = { nome: 'Maria da Silva', telefone: '(19) 99524-4237', skill: 'humanizer', aceito: true, hp: '' };
let env;
beforeEach(() => {
  env = ambiente({ TURNSTILE_SECRET: undefined }); // padrão novo: sem conta externa
  fetchFalso(() => { throw new Error('a prova de trabalho não pode chamar a rede'); });
});

async function desafioResolvido() {
  const r = await desafioGet({ request: get('/skills/api/desafio'), env });
  const { desafio, bits } = await r.json();
  return { desafio, solucao: solve(desafio, bits) };
}

test('zeros à esquerda', () => {
  assert.equal(zerosAEsquerda(new Uint8Array([0, 0, 0x3f])), 18);
  assert.equal(zerosAEsquerda(new Uint8Array([0x80])), 0);
  assert.equal(zerosAEsquerda(new Uint8Array([0, 1])), 15);
});

test('GET /desafio devolve desafio assinado com 18 bits; cross-site é recusado', async () => {
  const r = await desafioGet({ request: get('/skills/api/desafio'), env });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.bits, 18); assert.equal(BITS_POW, 18);
  assert.match(j.desafio, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  const corpo = JSON.parse(Buffer.from(j.desafio.split('.')[0], 'base64url').toString());
  assert.match(corpo.n, /^[A-Za-z0-9_-]{22}$/, 'nonce de 16 bytes');
  assert.ok(Math.abs(corpo.exp - (Date.now() + 120000)) < 2000, 'vale 120 s');
  const x = await desafioGet({ request: new Request(`${SITE}/skills/api/desafio`, { headers: { 'sec-fetch-site': 'cross-site' } }), env });
  assert.equal(x.status, 403);
  assert.equal((await desafioGet({ request: get('/skills/api/desafio'), env: {} })).status, 503);
});

test('desafio válido passa; expirado, adulterado e solução errada não', async () => {
  const { desafio } = await criarDesafio(SEGREDO);
  const solucao = solve(desafio, 18);
  assert.equal((await conferirDesafio(desafio, solucao, SEGREDO)).ok, true);
  assert.equal((await conferirDesafio(desafio, solucao, 'outro')).motivo, 'invalido', 'outro segredo');
  // expirado
  await comRelogio(VALIDADE_DESAFIO_MS + 1000, async () => {
    assert.equal((await conferirDesafio(desafio, solucao, SEGREDO)).motivo, 'vencido');
  });
  // assinatura adulterada / corpo trocado
  const [corpo, sig] = desafio.split('.');
  assert.equal((await conferirDesafio(`${corpo}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`, solucao, SEGREDO)).motivo, 'invalido');
  const outroCorpo = Buffer.from(JSON.stringify({ n: 'A'.repeat(22), exp: Date.now() + 1e9 })).toString('base64url');
  assert.equal((await conferirDesafio(`${outroCorpo}.${sig}`, solucao, SEGREDO)).motivo, 'invalido');
  // solução errada: procura um número que NÃO tenha os 18 zeros
  let errada = 0; while ((await conferirDesafio(desafio, String(errada), SEGREDO)).ok) errada++;
  assert.equal((await conferirDesafio(desafio, String(errada), SEGREDO)).motivo, 'solucao');
  assert.equal((await conferirDesafio(desafio, '', SEGREDO)).motivo, 'solucao');
  assert.equal((await conferirDesafio(desafio, 'x'.repeat(65), SEGREDO)).motivo, 'solucao');
  for (const lixo of [null, '', 'a', 'a.b.c', 'x'.repeat(400)]) assert.equal((await conferirDesafio(lixo, solucao, SEGREDO)).ok, false, String(lixo));
});

test('lead com prova de trabalho: grava, marca o nonce por 600 s, e o reuso é recusado', async () => {
  const pw = await desafioResolvido();
  let r = await lead({ request: post('/skills/api/lead', { ...BASE, ...pw }), env });
  assert.equal(r.status, 200); assert.match((await r.json()).url, /^\/skills\/api\/gratis\?s=humanizer&t=/);
  const [k] = env.FAISCA.chaves('pow:');
  assert.ok(k); assert.equal(env.FAISCA.ttlDe(k), 600);
  r = await lead({ request: post('/skills/api/lead', { ...BASE, telefone: '(21) 98877-6655', ...pw }), env });
  assert.equal(r.status, 400); assert.match((await r.json()).msg, /já foi usada/);
  assert.equal(env.FAISCA.chaves('lead:').length, 1);
});

test('lead sem nenhum token, com solução errada ou desafio vencido → 400 em português, nada gravado', async () => {
  let r = await lead({ request: post('/skills/api/lead', BASE), env });
  let j = await r.json();
  assert.equal(r.status, 400); assert.equal(j.campo, 'antirobo'); assert.match(j.msg, /anti-robô/);
  const pw = await desafioResolvido();
  r = await lead({ request: post('/skills/api/lead', { ...BASE, desafio: pw.desafio, solucao: 'errada' }), env });
  assert.equal(r.status, 400);
  await comRelogio(VALIDADE_DESAFIO_MS + 1000, async () => {
    r = await lead({ request: post('/skills/api/lead', { ...BASE, ...pw }), env });
    assert.equal(r.status, 400); assert.match((await r.json()).msg, /venceu/);
  });
  // turnstile sem TURNSTILE_SECRET configurado não vale
  r = await lead({ request: post('/skills/api/lead', { ...BASE, turnstile: 'qualquer' }), env });
  assert.equal(r.status, 400);
  assert.equal(env.FAISCA.chaves('lead:').length, 0);
});

test('Turnstile continua como alternativa quando há TURNSTILE_SECRET; "dev-ok" só em dev', async () => {
  const comT = { ...env, TURNSTILE_SECRET: 'segredo-t' };
  fetchFalso(new Response(JSON.stringify({ success: true }), { status: 200 }));
  assert.equal((await lead({ request: post('/skills/api/lead', { ...BASE, turnstile: 'tok' }), env: comT })).status, 200);
  fetchFalso(new Response(JSON.stringify({ success: false }), { status: 200 }));
  assert.equal((await lead({ request: post('/skills/api/lead', { ...BASE, telefone: '(31) 96655-4433', turnstile: 'tok' }), env: comT })).status, 400);
  fetchFalso(() => { throw new Error('não chama'); });
  assert.equal((await lead({ request: post('/skills/api/lead', { ...BASE, telefone: '(41) 95544-3322', turnstile: 'dev-ok' }), env: { ...env, AMBIENTE: 'dev' } })).status, 200, 'dev sem segredo');
  assert.equal((await lead({ request: post('/skills/api/lead', { ...BASE, telefone: '(51) 94433-2211', turnstile: 'dev-ok' }), env: { ...env, AMBIENTE: 'prod' } })).status, 400, 'prod');
});
