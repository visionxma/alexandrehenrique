import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as hook, interpretar } from '../functions/skills/api/nuvpag.js';
import { ambiente, HOOK, SITE } from './mocks.mjs';

let env;
beforeEach(() => { env = ambiente(); });

// Formato Cakto: segredo no corpo, evento em `event`, cliente em data.customer.
const cakto = (event, extra = {}) => ({
  secret: HOOK,
  event,
  data: { id: 'tx-123', status: event === 'purchase_approved' ? 'paid' : 'refunded', customer: { name: 'Fulano Tal', email: 'Fulano@Exemplo.com', phone: '11999990000' }, product: { name: 'Faísca' }, card: { lastDigits: '4242', holderName: 'FULANO' }, ...extra },
});
const enviar = (corpo, cabecalhos = {}, tipo = 'application/json') =>
  hook({ request: new Request(`${SITE}/skills/api/nuvpag`, { method: 'POST', headers: { 'content-type': tipo, ...cabecalhos }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) }), env });

test('compra aprovada (Cakto) grava pago:<email minúsculo> e guarda o resumo sem cartão', async () => {
  const r = await enviar(cakto('purchase_approved'));
  assert.equal(r.status, 200); assert.equal((await r.json()).acao, 'liberado');
  const p = JSON.parse(await env.FAISCA.get('pago:fulano@exemplo.com'));
  assert.equal(p.nome, 'Fulano Tal'); assert.equal(p.produto, 'Faísca'); assert.equal(p.transacao, 'tx-123'); assert.ok(p.quando);
  const [k] = env.FAISCA.chaves('hook:');
  assert.ok(k, 'resumo guardado');
  assert.equal(env.FAISCA.ttlDe(k), 30 * 24 * 3600, 'TTL de 30 dias');
  const resumo = await env.FAISCA.get(k);
  assert.ok(!resumo.includes('4242') && !resumo.includes('FULANO'), 'sem dado de cartão');
  assert.ok(!resumo.includes(HOOK), 'sem o segredo');
});

test('reembolso e chargeback apagam o acesso', async () => {
  await enviar(cakto('purchase_approved'));
  let r = await enviar(cakto('refund'));
  assert.equal((await r.json()).acao, 'revogado');
  assert.equal(await env.FAISCA.get('pago:fulano@exemplo.com'), null);
  await enviar(cakto('purchase_approved'));
  r = await enviar({ secret: HOOK, event: 'chargeback', data: { customer: { email: 'fulano@exemplo.com' } } });
  assert.equal((await r.json()).acao, 'revogado');
  assert.equal(await env.FAISCA.get('pago:fulano@exemplo.com'), null);
});

test('segredo: certo por cabeçalho, Bearer ou corpo; errado ou ausente → 401 sem gravar', async () => {
  const base = { event: 'approved', email: 'a@exemplo.com' };
  assert.equal((await enviar(base, { 'x-webhook-secret': HOOK })).status, 200);
  assert.equal((await enviar({ ...base, email: 'b@exemplo.com' }, { authorization: `Bearer ${HOOK}` })).status, 200);
  assert.equal((await enviar({ ...base, email: 'c@exemplo.com', token: HOOK })).status, 200);
  assert.equal(env.FAISCA.chaves('pago:').length, 3);
  for (const ruim of [{ 'x-webhook-secret': 'errado' }, { authorization: 'Bearer errado' }, {}])
    assert.equal((await enviar({ ...base, email: 'd@exemplo.com' }, ruim)).status, 401, JSON.stringify(ruim));
  assert.equal((await enviar({ ...base, email: 'd@exemplo.com', secret: HOOK.slice(0, -1) })).status, 401);
  assert.equal(await env.FAISCA.get('pago:d@exemplo.com'), null);
  assert.equal(env.FAISCA.chaves('hook:').length, 3, 'pedido não autorizado não deixa rastro');
});

test('evento desconhecido → 200 ignorado; aprovado sem e-mail → 200 ignorado', async () => {
  let r = await enviar({ secret: HOOK, event: 'pix_gerado', data: { status: 'waiting_payment', customer: { email: 'x@exemplo.com' } } });
  assert.equal(r.status, 200); assert.equal((await r.json()).acao, 'ignorado');
  r = await enviar({ secret: HOOK, event: 'purchase_approved', data: {} });
  assert.equal(r.status, 200); assert.equal((await r.json()).acao, 'ignorado');
  r = await enviar('isto não é json', { 'x-webhook-secret': HOOK }, 'text/plain');
  assert.equal(r.status, 200);
  assert.equal(env.FAISCA.chaves('pago:').length, 0);
});

test('formatos de payload diferentes', () => {
  const casos = [
    [{ event: 'purchase_approved', data: { customer: { email: 'A@x.com' } } }, 'aprovar', 'a@x.com'],
    [{ customer: { email: 'b@x.com' }, status: 'paid' }, 'aprovar', 'b@x.com'],
    [{ data: { email: 'c@x.com', status: 'aprovado' } }, 'aprovar', 'c@x.com'],
    [{ email: 'd@x.com', status: 'pago' }, 'aprovar', 'd@x.com'],
    [{ email: 'e@x.com', status: 'REEMBOLSADO' }, 'revogar', 'e@x.com'],
    [{ email: 'f@x.com', status: 'estornado' }, 'revogar', 'f@x.com'],
    [{ email: 'g@x.com', event: 'canceled' }, 'revogar', 'g@x.com'],
    [{ email: 'h@x.com', event: 'purchase_approved', data: { status: 'refunded' } }, 'revogar', 'h@x.com'], // revogar vence
    [{ email: 'i@x.com', event: 'checkout_abandonment' }, 'ignorar', 'i@x.com'],
    [{ data: { customer: { email: 'não é e-mail' } }, event: 'paid' }, 'aprovar', null],
  ];
  for (const [c, acao, email] of casos) {
    const i = interpretar(c);
    assert.equal(i.acao, acao, JSON.stringify(c)); assert.equal(i.email, email, JSON.stringify(c));
  }
});

test('corpo em formulário (x-www-form-urlencoded) também vale', async () => {
  const r = await enviar(`secret=${HOOK}&event=approved&email=form%40exemplo.com`, {}, 'application/x-www-form-urlencoded');
  assert.equal(r.status, 200);
  assert.ok(await env.FAISCA.get('pago:form@exemplo.com'));
});

test('sem configuração → 503', async () => {
  const r = await hook({ request: new Request(`${SITE}/skills/api/nuvpag`, { method: 'POST', body: '{}' }), env: { FAISCA: env.FAISCA } });
  assert.equal(r.status, 503);
});
