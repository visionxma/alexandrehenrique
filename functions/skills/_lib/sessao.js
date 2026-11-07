// Sessão do membro: cookie assinado + compra ainda ativa em `pago:`. Usada por /membros/eu e /membros/zip.
import { COOKIE_SESSAO, lerSessao } from './token.js';
import { K } from './kv.js';
import { lerCookie } from './resposta.js';
import { ehAdmin } from './admin.js';

/** → { email } quando o cookie é válido E a compra continua ativa; senão null. */
export async function membroAtivo(request, env) {
  const s = await lerSessao(lerCookie(request, COOKIE_SESSAO), env.SESSAO_SEGREDO);
  if (!s) return null;
  // Reembolso/estorno apaga `pago:` — a sessão cai na hora, mesmo com o cookie no prazo.
  // Admin não precisa de compra.
  if (!ehAdmin(s.email) && (await env.FAISCA.get(K.pago(s.email))) == null) return null;
  return s;
}
