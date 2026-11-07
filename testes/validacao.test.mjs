import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarNome, validarTelefone, normalizarEmail, mascararEmail, mascararTelefone, DDDS } from '../functions/skills/_lib/validacao.js';

test('telefone: celulares bons normalizam para +55DDDNÚMERO', () => {
  for (const [entrada, saida] of [
    ['(19) 99524-4237', '+5519995244237'],
    ['+55 11 98765-4320', '+5511987654320'],
    ['5511987654320', '+5511987654320'],
    ['011 98765-4320', '+5511987654320'],
    ['86 9 9912-3406', '+5586999123406'],
    ['99981234567', '+5599981234567'],
  ]) assert.deepEqual(validarTelefone(entrada), { ok: true, telefone: saida }, entrada);
});

test('telefone: ruins são recusados', () => {
  for (const ruim of [
    '', '123', 'abc',
    '(20) 99524-4237', // DDD 20 não existe
    '(23) 99524-4237', // DDD 23 não existe
    '(10) 99524-4237', '(00) 99524-4237',
    '(11) 3456-7890', // fixo (10 dígitos)
    '(11) 83456-7890', // 9 dígitos sem começar em 9
    '(11) 91111-1111', // 11111111
    '(11) 91234-5678', // 12345678
    '(11) 98765-4321', // 87654321
    '(11) 99999-9999', // repetido
    '(11) 91212-1212', // par alternado
    '(11) 91234-1234', // bloco repetido
    '11999999999999', // longo demais
  ]) assert.equal(validarTelefone(ruim).ok, false, ruim);
});

test('telefone: lista de DDD tem os 67 códigos oficiais', () => {
  assert.equal(DDDS.size, 67);
  for (const nao of [20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56, 57, 58, 59, 60, 70, 72, 76, 78, 80, 90]) assert.equal(DDDS.has(nao), false, String(nao));
});

test('nome: bons', () => {
  assert.deepEqual(validarNome('  Maria   da Silva '), { ok: true, nome: 'Maria da Silva' });
  assert.equal(validarNome('João Pedro').ok, true);
  assert.equal(validarNome("Ana D'Ávila").ok, true);
  assert.equal(validarNome('Ana-Clara Sá').ok, true);
  assert.equal(validarNome('=Maria Souza').nome, 'Maria Souza', 'tira o = de fórmula');
});

test('nome: ruins', () => {
  for (const ruim of ['', 'Maria', 'a b', 'Jo Li', 'Ze 123', 'Maria 2', 'aaa aaa', '@@ ##', 'Maria <script>', 'x'.repeat(50) + ' ' + 'y'.repeat(40), null, undefined])
    assert.equal(validarNome(ruim).ok, false, String(ruim));
});

test('e-mail: normaliza e recusa formato ruim', () => {
  assert.equal(normalizarEmail('  Fulano@Exemplo.COM '), 'fulano@exemplo.com');
  for (const ruim of ['', 'a@b', 'fulano', 'fulano@', '@x.com', 'a b@x.com', 'x@x..com', null]) assert.equal(normalizarEmail(ruim), null, String(ruim));
});

test('máscaras de log nunca mostram o dado inteiro', () => {
  assert.equal(mascararEmail('fulano@exemplo.com'), 'f***@e***');
  assert.equal(mascararTelefone('+5519995244237'), '+5519*****37');
});
