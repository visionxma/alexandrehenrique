// POST /skills/api/membros/sair → apaga o cookie de sessão.
import { json } from '../../_lib/resposta.js';
import { cookieApagado } from '../../_lib/token.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'set-cookie': cookieApagado() });
}
