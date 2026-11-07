// GET /skills/api/membros/admin            (só ADMIN) → { ok, leads, compras, totais }
// GET /skills/api/membros/admin?parte=funil (só ADMIN) → { ok, funil }
// Sem sessão válida → 401; sessão de quem não é admin → 403. Dado pessoal (nome, telefone, e-mail) sai SÓ aqui,
// nunca ipHash/ua. Cache-Control: no-store (vem do `json`).
// Orçamento de leituras (o plano grátis permite 50 subrequests por chamada): a listagem usa `list` com `metadata`
// (gravada junto do valor em lead.js e nuvpag.js) e só faz `get` das chaves antigas, SEM metadata, até MAX_GETS.
// O funil fica em outra chamada (?parte=funil) para ter o seu próprio orçamento (7 eventos x 7 dias = 49 leituras).
import { json, erro, MSG } from '../../_lib/resposta.js';
import { cookieApagado } from '../../_lib/token.js';
import { membroAtivo } from '../../_lib/sessao.js';
import { ehAdmin } from '../../_lib/admin.js';
import { K } from '../../_lib/kv.js';
import { EVENTOS, K_METRICA, ultimosDias } from '../../_lib/metricas.js';

const POR_PAGINA = 1000;
const MAX_PAGINAS = 5;
const TETO = 1000;
export const MAX_GETS = 40;
const LOTE = 20;
const DIAS_FUNIL = 7;

/** Lista as chaves com o prefixo (paginado: até 5 páginas de 1000, no máximo 1000 chaves). → [{ name, metadata }] */
async function chavesDe(kv, prefix) {
  const out = [];
  let cursor;
  for (let p = 0; p < MAX_PAGINAS && out.length < TETO; p++) {
    const r = await kv.list({ prefix, limit: POR_PAGINA, ...(cursor ? { cursor } : {}) });
    for (const k of r?.keys || []) {
      if (out.length >= TETO) break;
      out.push({ name: k.name, metadata: k.metadata && typeof k.metadata === 'object' ? k.metadata : null });
    }
    if (!r || r.list_complete || !r.cursor) break;
    cursor = r.cursor;
  }
  return out;
}

/**
 * Resolve o conteúdo de cada chave: metadata quando tem `q`; senão `get` (legado) enquanto sobrar orçamento.
 * `orcamento.gets` é compartilhado entre leads e compras. → [{ nome, v, incompleto }]
 */
async function resolver(kv, chaves, orcamento) {
  const saida = new Array(chaves.length);
  const legado = [];
  chaves.forEach((c, i) => {
    if (c.metadata && typeof c.metadata.q === 'string') saida[i] = { nome: c.name, v: c.metadata, incompleto: false, meta: true };
    else legado.push(i);
  });
  const ler = legado.slice(0, Math.max(0, orcamento.gets));
  orcamento.gets -= ler.length;
  for (const i of legado.slice(ler.length)) saida[i] = { nome: chaves[i].name, v: {}, incompleto: true };
  for (let j = 0; j < ler.length; j += LOTE) {
    await Promise.all(ler.slice(j, j + LOTE).map(async (i) => {
      let v = null;
      try {
        const bruto = await kv.get(chaves[i].name);
        v = bruto == null ? null : JSON.parse(bruto);
      } catch { /* valor ilegível vira incompleto */ }
      saida[i] = v && typeof v === 'object' ? { nome: chaves[i].name, v, incompleto: false } : { nome: chaves[i].name, v: {}, incompleto: true };
    }));
  }
  return saida;
}

const maisRecente = (a, b) => String(b.quando || '').localeCompare(String(a.quando || ''));
const marca = (linha, incompleto) => (incompleto ? { ...linha, incompleto: true } : linha);

async function funil(kv) {
  const f = { dias: DIAS_FUNIL };
  for (const e of EVENTOS) f[e] = 0;
  try {
    const dias = ultimosDias(DIAS_FUNIL);
    await Promise.all(EVENTOS.map(async (e) => {
      const valores = await Promise.all(dias.map(async (d) => {
        try { return Number(await kv.get(K_METRICA(d, e))) || 0; } catch { return 0; }
      }));
      f[e] = valores.reduce((a, b) => a + b, 0);
    }));
  } catch {
    // métrica nunca derruba a resposta
  }
  return f;
}

export async function onRequestGet({ request, env }) {
  if (!env.FAISCA || !env.SESSAO_SEGREDO) return erro(MSG.indisponivel, 503);
  const m = await membroAtivo(request, env);
  if (!m) return json({ ok: false, msg: MSG.semSessao }, 401, { 'set-cookie': cookieApagado() });
  if (!ehAdmin(m.email)) return erro('Acesso restrito.', 403);

  const kv = env.FAISCA;
  if (new URL(request.url).searchParams.get('parte') === 'funil') return json({ ok: true, funil: await funil(kv) });

  const [chavesLeads, chavesPagos] = await Promise.all([chavesDe(kv, K.lead('')), chavesDe(kv, K.pago(''))]);
  const orcamento = { gets: MAX_GETS };
  // Compras primeiro: são poucas e valem mais, então ficam com a prioridade nas leituras do legado.
  const pagosLidos = await resolver(kv, chavesPagos, orcamento);
  const leadsLidos = await resolver(kv, chavesLeads, orcamento);

  const leads = leadsLidos
    .map(({ nome, v, incompleto }) => marca({ id: nome.slice(K.lead('').length), nome: v.nome ?? v.n ?? '', telefone: v.telefone ?? v.t ?? '', skill: v.skill ?? v.s ?? '', quando: v.quando ?? v.q ?? '' }, incompleto))
    .sort(maisRecente);
  const compras = pagosLidos
    .map(({ nome, v, incompleto }) => marca({ email: nome.slice(K.pago('').length).toLowerCase(), nome: v.nome ?? v.n ?? '', produto: v.produto ?? v.p ?? '', transacao: v.transacao ?? v.x ?? '', quando: v.quando ?? v.q ?? '' }, incompleto))
    .sort(maisRecente);

  return json({ ok: true, leads, compras, totais: { leads: leads.length, compras: compras.length } });
}
