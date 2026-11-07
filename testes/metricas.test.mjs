import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { contar, diaSP, ultimosDias, EVENTOS, EVENTOS_CLIENTE } from '../functions/skills/_lib/metricas.js';
import { onRequestPost as medir } from '../functions/skills/api/medir.js';
import { onRequestGet as relatorio } from '../functions/skills/api/medir-relatorio.js';
import { onRequestPost as lead } from '../functions/skills/api/lead.js';
import { onRequestGet as gratis } from '../functions/skills/api/gratis.js';
import { onRequestPost as hook } from '../functions/skills/api/nuvpag.js';
import { ambiente, post, get, fetchFalso, HOOK, SITE } from './mocks.mjs';

let env;
beforeEach(() => { env = ambiente(); });
const hoje = () => diaSP();
const valor = (e) => env.FAISCA.get(`m:${hoje()}:${e}`);

test('contar soma 1 por chamada, com TTL de 120 dias e sem dado pessoal na chave', async () => {
  assert.equal(await contar(env, 'visita'), true);
  await contar(env, 'visita');
  await contar(env, 'clique_painel');
  assert.equal(await valor('visita'), '2');
  assert.equal(await valor('clique_painel'), '1');
  assert.equal(env.FAISCA.ttlDe(`m:${hoje()}:visita`), 120 * 24 * 3600);
  assert.deepEqual(env.FAISCA.chaves().sort(), [`m:${hoje()}:clique_painel`, `m:${hoje()}:visita`]);
});

test('evento fora da lista é ignorado; KV ausente ou quebrado não lança', async () => {
  assert.equal(await contar(env, 'hackeado'), false);
  assert.equal(await contar(env, '__proto__'), false);
  assert.equal(env.FAISCA.chaves().length, 0);
  assert.equal(await contar({}, 'visita'), false);
  assert.equal(await contar(undefined, 'visita'), false);
  const quebrado = { FAISCA: { get: async () => { throw new Error('KV caiu'); }, put: async () => { throw new Error('KV caiu'); } } };
  assert.equal(await contar(quebrado, 'visita'), false);
});

test('o dia é o de São Paulo, não o UTC (22h em SP já é o dia seguinte em UTC)', () => {
  assert.equal(diaSP(Date.parse('2026-11-07T01:30:00Z')), '2026-11-06'); // 22h30 do dia 6 em SP
  assert.equal(diaSP(Date.parse('2026-11-07T03:00:00Z')), '2026-11-07'); // 00h em SP
  assert.deepEqual(ultimosDias(3, Date.parse('2026-11-07T12:00:00Z')), ['2026-11-05', '2026-11-06', '2026-11-07']);
});

test('lista de eventos: o navegador não informa o que só o servidor sabe', () => {
  for (const e of ['visita', 'clique_painel', 'abre_baixar', 'baixou_gratis', 'clique_comprar', 'compra_aprovada', 'reembolso']) assert.ok(EVENTOS.includes(e), e);
  assert.ok(!EVENTOS_CLIENTE.includes('baixou_gratis') && !EVENTOS_CLIENTE.includes('compra_aprovada') && !EVENTOS_CLIENTE.includes('reembolso'));
});

test('POST /medir: evento válido conta e responde 204 sem corpo', async () => {
  const r = await medir({ request: post('/skills/api/medir', { evento: 'abre_baixar' }), env });
  assert.equal(r.status, 204);
  assert.equal(await r.text(), '');
  assert.equal(await valor('abre_baixar'), '1');
});

test('POST /medir: evento desconhecido ou só de servidor dá 204 e não grava', async () => {
  for (const evento of ['nada', 'baixou_gratis', 'compra_aprovada', 'reembolso', 42, null]) {
    const r = await medir({ request: post('/skills/api/medir', { evento }), env });
    assert.equal(r.status, 204, String(evento));
  }
  assert.equal(env.FAISCA.chaves('m:').length, 0);
});

test('POST /medir: outra origem 403, sem Origin 403, JSON ruim 400, sem KV 503', async () => {
  assert.equal((await medir({ request: post('/skills/api/medir', { evento: 'visita' }, { origem: 'https://outro.site' }), env })).status, 403);
  assert.equal((await medir({ request: post('/skills/api/medir', { evento: 'visita' }, { origem: null }), env })).status, 403);
  assert.equal((await medir({ request: post('/skills/api/medir', '{quebrado'), env })).status, 400);
  assert.equal((await medir({ request: post('/skills/api/medir', '[1]'), env })).status, 400);
  assert.equal((await medir({ request: post('/skills/api/medir', { evento: 'visita' }), env: { ...env, FAISCA: undefined } })).status, 503);
  assert.equal(env.FAISCA.chaves('m:').length, 0);
});

test('POST /medir: o IP passa a 300 por hora e a 301ª recebe 429 sem contar', async () => {
  for (let i = 0; i < 300; i++) assert.equal((await medir({ request: post('/skills/api/medir', { evento: 'visita' }, { ip: '9.9.9.9' }), env })).status, 204);
  assert.equal((await medir({ request: post('/skills/api/medir', { evento: 'visita' }, { ip: '9.9.9.9' }), env })).status, 429);
  assert.equal(await valor('visita'), '300');
  assert.equal((await medir({ request: post('/skills/api/medir', { evento: 'visita' }, { ip: '8.8.8.8' }), env })).status, 204, 'outro IP segue livre');
  assert.ok(!env.FAISCA.chaves().some((k) => k.includes('9.9.9.9')), 'IP puro nunca vira chave');
});

const relat = (q = '', segredo = HOOK) => relatorio({ request: new Request(`${SITE}/skills/api/medir-relatorio${q}`, { headers: segredo == null ? {} : { 'x-webhook-secret': segredo } }), env });

test('relatório: exige o segredo do webhook', async () => {
  assert.equal((await relat('', null)).status, 401);
  assert.equal((await relat('', 'errado')).status, 401);
  assert.equal((await relat('', '')).status, 401);
  assert.equal((await relatorio({ request: get('/skills/api/medir-relatorio'), env: { ...env, WEBHOOK_NUVPAG_SEGREDO: undefined } })).status, 503);
});

test('funil de ponta a ponta: visita, cadastro, download, compra e reembolso aparecem no relatório sem dado pessoal', async () => {
  const turnstile = fetchFalso(new Response(JSON.stringify({ success: true }), { status: 200 }));
  for (const e of ['visita', 'visita', 'visita', 'clique_painel', 'abre_baixar', 'abre_baixar', 'clique_comprar']) await medir({ request: post('/skills/api/medir', { evento: e }), env });

  // download grátis: o /lead entrega o link; só o GET do zip conta, uma vez por download liberado
  const l = await (await lead({ request: post('/skills/api/lead', { nome: 'Maria da Silva', telefone: '(19) 99524-4237', skill: 'humanizer', turnstile: 'tok', aceito: true, hp: '' }), env })).json();
  assert.equal(await valor('baixou_gratis'), null, 'emitir o link ainda não é baixar');
  assert.equal((await gratis({ request: get(l.url), env })).status, 200);
  assert.equal(await valor('baixou_gratis'), '1');
  assert.equal((await gratis({ request: get(l.url.replace(/\.[^.]+$/, '.assinatura-falsa')), env })).status, 403);
  assert.equal(await valor('baixou_gratis'), '1', 'link inválido não conta');
  assert.equal(turnstile.length, 1);

  // compra e reembolso pelo webhook
  const evento = (event) => hook({ request: new Request(`${SITE}/skills/api/nuvpag`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: HOOK, event, data: { id: 'tx1', customer: { name: 'Fulano Tal', email: 'fulano@exemplo.com' } } }) }), env });
  assert.equal((await (await evento('purchase_approved')).json()).acao, 'liberado');
  assert.equal((await (await evento('purchase_approved')).json()).acao, 'liberado');
  await evento('refund');
  const r = await evento('evento_desconhecido');
  assert.equal((await r.json()).acao, 'ignorado');
  assert.equal(await valor('compra_aprovada'), '2');
  assert.equal(await valor('reembolso'), '1');

  const res = await relat('?dias=3');
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true); assert.equal(j.dias, 3);
  assert.deepEqual(Object.keys(j.porDia), ultimosDias(3));
  assert.deepEqual(j.total, { visita: 3, clique_painel: 1, abre_baixar: 2, baixou_gratis: 1, clique_comprar: 1, compra_aprovada: 2, reembolso: 1 });
  assert.deepEqual(j.porDia[hoje()], j.total, 'tudo aconteceu hoje');
  assert.equal(j.leads, 1);
  assert.equal(j.compras, 0, 'o reembolso apagou o acesso pago');
  const texto = JSON.stringify(j);
  for (const proibido of ['Maria', '99524', 'fulano', 'exemplo.com', '200.1.2.3']) assert.ok(!texto.includes(proibido), proibido);
});

test('relatório: dias fora da faixa são ajustados e dias antigos não entram na soma', async () => {
  await contar(env, 'visita', Date.now() - 10 * 86400000);
  await contar(env, 'visita');
  assert.equal((await (await relat('?dias=7')).json()).total.visita, 1);
  assert.equal((await (await relat('?dias=30')).json()).total.visita, 2);
  assert.equal((await (await relat('?dias=999')).json()).dias, 30);
  assert.equal((await (await relat('?dias=0')).json()).dias, 1);
  assert.equal((await (await relat('?dias=abc')).json()).dias, 7);
  assert.equal((await (await relat()).json()).dias, 7);
});

test('compras conta os acessos pagos ativos', async () => {
  await env.FAISCA.put('pago:a@x.com', '{}'); await env.FAISCA.put('pago:b@x.com', '{}');
  assert.equal((await (await relat()).json()).compras, 2);
});
