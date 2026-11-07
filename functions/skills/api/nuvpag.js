// POST /skills/api/nuvpag — webhook da NuvPag (mesmo formato da Cakto).
// Compra aprovada → grava `pago:<email>` (libera a área de membros). Reembolso/estorno/cancelamento → apaga.
// Segredo aceito em: cabeçalho x-webhook-secret, Authorization: Bearer, ou campo `secret`/`token` do corpo.
// Responde 200 para evento desconhecido (a NuvPag não reenvia) e 401 para segredo errado.
import { json, erro, MSG } from '../_lib/resposta.js';
import { iguais } from '../_lib/token.js';
import { normalizarEmail } from '../_lib/validacao.js';
import { K, gravarJSON } from '../_lib/kv.js';
import { contar } from '../_lib/metricas.js';

const APROVADO = new Set(['purchase_approved', 'approved', 'paid', 'aprovado', 'aprovada', 'pago', 'compra_aprovada']);
const REVOGAR = new Set([
  'refunded', 'refund', 'chargeback', 'canceled', 'cancelled', 'reembolsado', 'reembolso', 'estornado', 'estorno', 'cancelado',
  'purchase_refunded', 'purchase_chargeback', 'purchase_canceled', 'purchase_cancelled', 'subscription_canceled', 'subscription_cancelled',
]);
const TTL_HOOK_S = 30 * 24 * 60 * 60;

const primeiro = (...v) => v.find((x) => typeof x === 'string' && x.trim() !== '' || typeof x === 'number');
const texto = (v) => (v == null ? '' : String(v).trim());

/** Corpo em JSON ou formulário (x-www-form-urlencoded). Corpo ilegível vira {}. */
async function lerCorpo(request) {
  const bruto = await request.text().catch(() => '');
  if (!bruto) return {};
  try {
    const j = JSON.parse(bruto);
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch {
    const p = new URLSearchParams(bruto);
    const o = {};
    for (const [k, v] of p) o[k] = v;
    // formulário com `data` em JSON
    if (typeof o.data === 'string') try { o.data = JSON.parse(o.data); } catch { /* fica texto */ }
    return o;
  }
}

/** Extrai o que importa de payloads em formatos diferentes. */
export function interpretar(c) {
  const d = c.data && typeof c.data === 'object' ? c.data : {};
  const email = normalizarEmail(primeiro(d.customer?.email, c.customer?.email, d.email, c.email));
  const candidatos = [c.event, d.status, c.status].map((x) => texto(x).toLowerCase()).filter(Boolean);
  // Revogar vence aprovar: na dúvida entre os dois, o acesso cai (é mais seguro).
  const acao = candidatos.some((x) => REVOGAR.has(x)) ? 'revogar' : candidatos.some((x) => APROVADO.has(x)) ? 'aprovar' : 'ignorar';
  return {
    acao,
    evento: candidatos.join('|').slice(0, 120),
    email,
    nome: texto(primeiro(d.customer?.name, c.customer?.name, d.name, c.name)).slice(0, 120),
    produto: texto(primeiro(d.product?.name, c.product?.name, d.offer?.name, c.produto, d.product?.id)).slice(0, 160),
    transacao: texto(primeiro(d.id, d.transaction_id, d.refId, c.transaction_id, c.id, c.transacao)).slice(0, 120),
  };
}

// Campos que nunca vão para o resumo guardado: cartão, segredo, documento.
const PROIBIDO = /card|cart[aã]o|cvv|cvc|bin$|last_?4|expir|holder|secret|token|password|senha|authorization|cpf|cnpj|document|pix_?code|qr_?code|barcode/i;
export function resumir(obj, nivel = 0) {
  if (nivel > 4) return '[...]';
  if (Array.isArray(obj)) return obj.slice(0, 10).map((x) => resumir(x, nivel + 1));
  if (obj && typeof obj === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(obj).slice(0, 40)) o[k] = PROIBIDO.test(k) ? '[removido]' : resumir(v, nivel + 1);
    return o;
  }
  return typeof obj === 'string' ? obj.slice(0, 300) : obj;
}

export async function onRequestPost({ request, env }) {
  if (!env.FAISCA || !env.WEBHOOK_NUVPAG_SEGREDO) return erro(MSG.indisponivel, 503);
  const c = await lerCorpo(request);

  const auth = request.headers.get('authorization') || '';
  const dado = request.headers.get('x-webhook-secret') || (/^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '') : '') || texto(c.secret) || texto(c.token);
  if (!(await iguais(dado, env.WEBHOOK_NUVPAG_SEGREDO))) return erro('Não autorizado.', 401);

  const i = interpretar(c);
  const agora = Date.now();
  // Guarda o pedido resumido (sem cartão nem segredo) por 30 dias, para depurar.
  await gravarJSON(env.FAISCA, K.hook(agora, crypto.randomUUID().slice(0, 8)), { quando: new Date(agora).toISOString(), acao: i.acao, evento: i.evento, corpo: resumir(c) }, { expirationTtl: TTL_HOOK_S });

  if (i.acao === 'ignorar') return json({ ok: true, acao: 'ignorado', motivo: 'evento desconhecido' });
  if (!i.email) return json({ ok: true, acao: 'ignorado', motivo: 'sem e-mail' });

  if (i.acao === 'aprovar') {
    await gravarJSON(env.FAISCA, K.pago(i.email), { nome: i.nome, produto: i.produto, transacao: i.transacao, quando: new Date(agora).toISOString() });
    await contar(env, 'compra_aprovada');
    return json({ ok: true, acao: 'liberado' });
  }
  await env.FAISCA.delete(K.pago(i.email));
  await env.FAISCA.delete(K.otp(i.email));
  await contar(env, 'reembolso');
  return json({ ok: true, acao: 'revogado' });
}
