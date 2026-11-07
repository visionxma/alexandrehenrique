// GET /skills/api/membros/eu → { ok:true, email } ou 401 (cookie inválido/vencido ou compra revogada; limpa o cookie).
import { json, erro, MSG } from '../../_lib/resposta.js';
import { cookieApagado } from '../../_lib/token.js';
import { membroAtivo } from '../../_lib/sessao.js';

export async function onRequestGet({ request, env }) {
  if (!env.FAISCA || !env.SESSAO_SEGREDO) return erro(MSG.indisponivel, 503);
  const m = await membroAtivo(request, env);
  if (!m) return json({ ok: false, msg: MSG.semSessao }, 401, { 'set-cookie': cookieApagado() });
  return json({ ok: true, email: m.email });
}
