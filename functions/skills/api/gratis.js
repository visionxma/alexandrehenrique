// GET /skills/api/gratis?s=<skill>&t=<token>
// Entrega o zip de uma das 5 skills grátis — ou s=todas, as 5 num zip só (faisca-5-skills-gratis.zip) —,
// só com o token que /lead emitiu (ligado à skill e ao lead, 10 min). Qualquer outra skill → 404.
import { erro, MSG } from '../_lib/resposta.js';
import { conferirTokenGratis } from '../_lib/token.js';
import { GRATIS } from '../_lib/gratis.js';
import { contar } from '../_lib/metricas.js';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const skill = u.searchParams.get('s') || '';
  if (!Object.hasOwn(GRATIS, skill)) return erro('Skill não encontrada.', 404);
  if (!env.SESSAO_SEGREDO) return erro(MSG.indisponivel, 503);

  const v = await conferirTokenGratis(u.searchParams.get('t'), skill, env.SESSAO_SEGREDO);
  if (!v.ok && v.motivo === 'vencido') return erro('Este link venceu. Preencha o cadastro de novo para baixar.', 410);
  if (!v.ok) return erro('Link inválido. Preencha o cadastro para baixar.', 403);

  await contar(env, 'baixou_gratis'); // um por download liberado (token válido)
  const { arquivo, base64 } = GRATIS[skill];
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Response(bin, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${arquivo}"`,
      'content-length': String(bin.length),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
