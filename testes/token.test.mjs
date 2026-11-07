import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenGratis, conferirTokenGratis, criarSessao, lerSessao, iguais, codigoSeisDigitos, b64url, deB64url, VALIDADE_GRATIS_MS, cookieSessao } from '../functions/skills/_lib/token.js';

const S = 'segredo';
const LEAD = '6f1c2a9e-1111-4222-8333-944455556666';

test('token grátis: válido', async () => {
  const t = await tokenGratis('humanizer', LEAD, S);
  assert.deepEqual(await conferirTokenGratis(t, 'humanizer', S), { ok: true, leadId: LEAD });
});

test('token grátis: expirado depois de 10 min', async () => {
  const agora = Date.now();
  const t = await tokenGratis('humanizer', LEAD, S, agora);
  assert.equal((await conferirTokenGratis(t, 'humanizer', S, agora + VALIDADE_GRATIS_MS - 1)).ok, true);
  assert.deepEqual(await conferirTokenGratis(t, 'humanizer', S, agora + VALIDADE_GRATIS_MS + 1), { ok: false, motivo: 'vencido' });
});

test('token grátis: adulterado, skill trocada, segredo outro e lixo não passam', async () => {
  const t = await tokenGratis('humanizer', LEAD, S);
  const [id, exp, sig] = t.split('.');
  assert.equal((await conferirTokenGratis(`${id}.${Number(exp) + 999999}.${sig}`, 'humanizer', S)).motivo, 'invalido', 'prazo esticado');
  assert.equal((await conferirTokenGratis(`${id.replace('6f', '7f')}.${exp}.${sig}`, 'humanizer', S)).motivo, 'invalido', 'lead trocado');
  assert.equal((await conferirTokenGratis(`${id}.${exp}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`, 'humanizer', S)).motivo, 'invalido', 'assinatura mexida');
  assert.equal((await conferirTokenGratis(t, 'brainstorming', S)).motivo, 'invalido', 'skill trocada');
  assert.equal((await conferirTokenGratis(t, 'humanizer', 'outro')).motivo, 'invalido', 'outro segredo');
  for (const lixo of ['', null, 'a.b', 'a.b.c.d', '../x.1.y']) assert.equal((await conferirTokenGratis(lixo, 'humanizer', S)).ok, false, String(lixo));
});

test('sessão: ida e volta, vencida e adulterada', async () => {
  const agora = Date.now();
  const c = await criarSessao('fulano@x.com', S, agora);
  assert.deepEqual(await lerSessao(c, S, agora), { email: 'fulano@x.com' });
  assert.equal(await lerSessao(c, S, agora + 31 * 24 * 3600 * 1000), null, 'passou de 30 dias');
  const [corpo, sig] = c.split('.');
  const outro = b64url(new TextEncoder().encode(JSON.stringify({ email: 'invasor@x.com', exp: agora + 1e9 })));
  assert.equal(await lerSessao(`${outro}.${sig}`, S, agora), null, 'corpo trocado');
  assert.equal(await lerSessao(`${corpo}.${sig}x`, S, agora), null);
  assert.equal(await lerSessao(c, 'outro', agora), null);
  assert.equal(await lerSessao(null, S), null);
  assert.equal(JSON.parse(new TextDecoder().decode(deB64url(corpo))).email, 'fulano@x.com');
});

test('cookie de sessão tem as travas pedidas', () => {
  const c = cookieSessao('v');
  for (const p of ['faisca_sessao=v', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/skills', 'Max-Age=2592000']) assert.ok(c.includes(p), p);
});

test('comparação constante e código de 6 dígitos', async () => {
  assert.equal(await iguais('abc', 'abc'), true);
  assert.equal(await iguais('abc', 'abd'), false);
  assert.equal(await iguais('abc', 'abcd'), false);
  assert.equal(await iguais(undefined, ''), false);
  const vistos = new Set();
  for (let i = 0; i < 200; i++) { const c = codigoSeisDigitos(); assert.match(c, /^\d{6}$/); vistos.add(c); }
  assert.ok(vistos.size > 190, 'códigos variam');
});
