// POST /skills/api/membros/entrar  { email }
// Responde SEMPRE a mesma mensagem (não revela se o e-mail comprou). Se comprou, gera um código de 6 dígitos,
// guarda só o HASH em `otp:<email>` por 10 min e manda por e-mail. Em AMBIENTE=dev o código volta em `codigoDev`.
import { json, erro, MSG, lerJson, mesmaOrigem, ipDe, emDev } from '../../_lib/resposta.js';
import { normalizarEmail } from '../../_lib/validacao.js';
import { codigoSeisDigitos, hashComChave, hashCodigo } from '../../_lib/token.js';
import { K, gravarJSON } from '../../_lib/kv.js';
import { contar } from '../../_lib/limite.js';
import { enviarCodigo } from '../../_lib/email.js';

export const VALIDADE_OTP_S = 10 * 60;
export const MENSAGEM = 'Se este e-mail tiver uma compra aprovada, enviamos um código de 6 dígitos. Ele vale por 10 minutos.';

export async function onRequestPost({ request, env, waitUntil }) {
  if (!mesmaOrigem(request)) return erro(MSG.invalido, 403);
  if (!env.FAISCA || !env.SESSAO_SEGREDO) return erro(MSG.indisponivel, 503);
  const b = await lerJson(request);
  if (!b) return erro(MSG.invalido, 400);
  const email = normalizarEmail(b.email);
  if (!email) return erro('Confira o e-mail.', 422, { campo: 'email' });

  const [ipHash, emailHash] = await Promise.all([hashComChave('ip', ipDe(request), env.SESSAO_SEGREDO), hashComChave('email', email, env.SESSAO_SEGREDO)]);
  const [porIp, porEmail] = await Promise.all([contar(env.FAISCA, 'entrar-ip', ipHash), contar(env.FAISCA, 'entrar-email', emailHash)]);
  if (!porIp.ok || !porEmail.ok) return erro(MSG.muitos, 429);

  const resposta = { ok: true, msg: MENSAGEM };
  if ((await env.FAISCA.get(K.pago(email))) == null) return json(resposta);

  const codigo = codigoSeisDigitos();
  await gravarJSON(env.FAISCA, K.otp(email), { hash: await hashCodigo(email, codigo, env.SESSAO_SEGREDO), tentativas: 0, exp: Date.now() + VALIDADE_OTP_S * 1000 }, { expirationTtl: VALIDADE_OTP_S });

  // O envio corre depois da resposta: o tempo de resposta não denuncia quem comprou.
  const envio = enviarCodigo(env, email, codigo).then((r) => {
    if (!r.ok && !emDev(env)) console.log(`faisca: e-mail do código não enviado (${r.motivo})`);
  });
  if (typeof waitUntil === 'function') waitUntil(envio);
  else await envio;

  if (emDev(env)) resposta.codigoDev = codigo; // NUNCA em produção
  return json(resposta);
}
