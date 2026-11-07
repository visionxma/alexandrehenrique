// POST /skills/api/membros/codigo  { email, codigo }
// Confere o código (no máximo 5 tentativas), apaga o otp e abre a sessão no cookie `faisca_sessao` (30 dias).
import { json, erro, MSG, lerJson, mesmaOrigem } from '../../_lib/resposta.js';
import { normalizarEmail } from '../../_lib/validacao.js';
import { iguais, criarSessao, cookieSessao, hashCodigo } from '../../_lib/token.js';
import { K, lerJSON, gravarJSON, ttl } from '../../_lib/kv.js';

export const MAX_TENTATIVAS = 5;
const INVALIDO = 'Código inválido ou vencido. Confira ou peça um novo.';

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return erro(MSG.invalido, 403);
  if (!env.FAISCA || !env.SESSAO_SEGREDO) return erro(MSG.indisponivel, 503);
  const b = await lerJson(request);
  if (!b) return erro(MSG.invalido, 400);
  const email = normalizarEmail(b.email);
  const codigo = String(b.codigo ?? '').replace(/\D/g, '');
  if (!email || codigo.length !== 6) return erro(INVALIDO, 401);

  const otp = await lerJSON(env.FAISCA, K.otp(email));
  if (!otp || Date.now() > otp.exp) return erro(INVALIDO, 401);
  if (otp.tentativas >= MAX_TENTATIVAS) {
    await env.FAISCA.delete(K.otp(email));
    return erro('Muitas tentativas. Peça um código novo.', 429);
  }

  if (!(await iguais(await hashCodigo(email, codigo, env.SESSAO_SEGREDO), otp.hash))) {
    const tentativas = otp.tentativas + 1;
    if (tentativas >= MAX_TENTATIVAS) {
      await env.FAISCA.delete(K.otp(email));
      return erro('Muitas tentativas. Peça um código novo.', 429);
    }
    await gravarJSON(env.FAISCA, K.otp(email), { ...otp, tentativas }, { expirationTtl: ttl((otp.exp - Date.now()) / 1000) });
    return erro(INVALIDO, 401, { restantes: MAX_TENTATIVAS - tentativas });
  }

  await env.FAISCA.delete(K.otp(email)); // código de uso único
  if ((await env.FAISCA.get(K.pago(email))) == null) return erro(INVALIDO, 401); // reembolsou no meio do caminho
  return json({ ok: true, email }, 200, { 'set-cookie': cookieSessao(await criarSessao(email, env.SESSAO_SEGREDO)) });
}
