// POST /skills/api/medir  { evento }
// O navegador avisa que uma etapa do funil aconteceu (visita, clique_painel, abre_baixar, clique_comprar).
// Não leva nem guarda dado pessoal. Responde 204 sem corpo (serve para sendBeacon); evento fora da lista também é 204.
// `baixou_gratis`, `compra_aprovada` e `reembolso` só o servidor conta (gratis.js e nuvpag.js): o navegador não os informa.
import { erro, MSG, lerJson, mesmaOrigem, ipDe } from '../_lib/resposta.js';
import { hashComChave } from '../_lib/token.js';
import { contar as limitar } from '../_lib/limite.js';
import { contar, EVENTOS_CLIENTE } from '../_lib/metricas.js';

const SEM_CORPO = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return erro(MSG.invalido, 403);
  if (!env.FAISCA || !env.SESSAO_SEGREDO) return erro(MSG.indisponivel, 503);
  const b = await lerJson(request);
  if (!b) return erro(MSG.invalido, 400);

  const evento = typeof b.evento === 'string' ? b.evento : '';
  if (!EVENTOS_CLIENTE.includes(evento)) return SEM_CORPO();

  // Freio para robô inflando o funil: 300 avisos por hora por IP (o IP entra só em hash).
  const ipHash = await hashComChave('ip', ipDe(request), env.SESSAO_SEGREDO);
  const lim = await limitar(env.FAISCA, 'medir-ip', ipHash, 300);
  if (!lim.ok) return erro(MSG.muitos, 429);

  await contar(env, evento);
  return SEM_CORPO();
}
