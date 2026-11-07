// GET /skills/api/medir-relatorio?dias=7   (cabeçalho x-webhook-secret = WEBHOOK_NUVPAG_SEGREDO)
// Funil por dia e total (padrão 7 dias, de 1 a 30), mais `leads` (cadastros do download grátis, todos os tempos)
// e `compras` (acessos pagos ATIVOS agora: reembolso apaga `pago:<email>`; as compras do período estão em
// `compra_aprovada`). Só números: nenhum e-mail, telefone ou nome sai daqui.
import { json, erro, MSG } from '../_lib/resposta.js';
import { iguais } from '../_lib/token.js';
import { EVENTOS, ultimosDias, K_METRICA } from '../_lib/metricas.js';

const MAX_DIAS = 30;
const MAX_PAGINAS = 50; // trava de segurança: 50 listas de até 1000 chaves

/** Quantas chaves existem com o prefixo (percorre as páginas do list). */
async function contarChaves(kv, prefixo) {
  let n = 0, cursor;
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const r = await kv.list({ prefix: prefixo, cursor });
    n += r.keys.length;
    if (r.list_complete || !r.cursor) return { n, completo: true };
    cursor = r.cursor;
  }
  return { n, completo: false };
}

export async function onRequestGet({ request, env }) {
  if (!env.FAISCA || !env.WEBHOOK_NUVPAG_SEGREDO) return erro(MSG.indisponivel, 503);
  if (!(await iguais(request.headers.get('x-webhook-secret') || '', env.WEBHOOK_NUVPAG_SEGREDO))) return erro('Não autorizado.', 401);

  const pedido = Number.parseInt(new URL(request.url).searchParams.get('dias') ?? '7', 10);
  const dias = Number.isFinite(pedido) ? Math.min(MAX_DIAS, Math.max(1, pedido)) : 7;
  const lista = ultimosDias(dias);

  // Um list só traz os nomes que existem; só esses ganham get (poupa chamadas ao KV).
  const existentes = new Set();
  let cursor;
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const r = await env.FAISCA.list({ prefix: 'm:', cursor });
    for (const k of r.keys) existentes.add(k.name);
    if (r.list_complete || !r.cursor) break;
    cursor = r.cursor;
  }

  const linhas = await Promise.all(lista.map(async (dia) => Object.fromEntries(await Promise.all(EVENTOS.map(async (e) => {
    const chave = K_METRICA(dia, e);
    return [e, existentes.has(chave) ? Number(await env.FAISCA.get(chave)) || 0 : 0];
  })))));
  const porDia = Object.fromEntries(lista.map((dia, i) => [dia, linhas[i]]));
  const total = Object.fromEntries(EVENTOS.map((e) => [e, linhas.reduce((s, l) => s + l[e], 0)]));

  const [leads, compras] = await Promise.all([contarChaves(env.FAISCA, 'lead:'), contarChaves(env.FAISCA, 'pago:')]);
  return json({ ok: true, dias, de: lista[0], ate: lista[lista.length - 1], total, porDia, leads: leads.n, compras: compras.n, parcial: !(leads.completo && compras.completo) || undefined });
}
