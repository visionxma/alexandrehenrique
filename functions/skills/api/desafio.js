// GET /skills/api/desafio → { ok:true, desafio, bits }
// Desafio da prova de trabalho que o formulário resolve antes de mandar o /lead (ver _lib/pow.js).
// Mesma origem: sem cabeçalho CORS, outro site não lê a resposta; e pedido marcado como cross-site é recusado.
import { json, erro, MSG } from '../_lib/resposta.js';
import { criarDesafio } from '../_lib/pow.js';

export async function onRequestGet({ request, env }) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return erro(MSG.invalido, 403);
  if (!env.SESSAO_SEGREDO) return erro(MSG.indisponivel, 503);
  return json({ ok: true, ...(await criarDesafio(env.SESSAO_SEGREDO)) });
}
