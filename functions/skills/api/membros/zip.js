// GET /skills/api/membros/zip?s=<id> | ?cat=<slug> | ?todas=1
// Só para membro com sessão e compra ativa. Entrega do R2 (ZIPS), em fluxo:
//   skills/<categoria>/<id>.zip   categorias/<slug>.zip   todas.zip
// id e slug só valem se estão no catálogo embutido (barra caminho malicioso como ../).
import { erro, MSG } from '../../_lib/resposta.js';
import { membroAtivo } from '../../_lib/sessao.js';
import { SKILLS, CATEGORIAS } from '../../_lib/catalogo.js';

/** Traduz os parâmetros para { chave, arquivo } do R2, ou null se o pedido não vale. */
export function chaveDoPedido(params) {
  const s = params.get('s');
  const cat = params.get('cat');
  if (s != null) return Object.hasOwn(SKILLS, s) ? { chave: `skills/${SKILLS[s]}/${s}.zip`, arquivo: `${s}.zip` } : null;
  if (cat != null) return CATEGORIAS.includes(cat) ? { chave: `categorias/${cat}.zip`, arquivo: `faisca-${cat}.zip` } : null;
  if (params.get('todas') === '1') return { chave: 'todas.zip', arquivo: 'faisca-todas-as-skills.zip' };
  return null;
}

export async function onRequestGet({ request, env }) {
  if (!env.FAISCA || !env.SESSAO_SEGREDO || !env.ZIPS) return erro(MSG.indisponivel, 503);
  if (!(await membroAtivo(request, env))) return erro(MSG.semSessao, 401);

  const pedido = chaveDoPedido(new URL(request.url).searchParams);
  if (!pedido) return erro('Arquivo não encontrado.', 404);
  const obj = await env.ZIPS.get(pedido.chave);
  if (!obj) return erro('Arquivo não encontrado.', 404);

  const h = new Headers({
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="${pedido.arquivo}"`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
  if (Number.isFinite(obj.size)) h.set('content-length', String(obj.size));
  if (obj.httpEtag) h.set('etag', obj.httpEtag);
  return new Response(obj.body, { headers: h });
}
