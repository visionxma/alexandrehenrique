// POST /skills/api/lead  { nome, telefone, skill, desafio, solucao, aceito, hp }   (ou `turnstile` no lugar de desafio/solucao)
// Cadastro para baixar uma skill grátis: valida, confere o anti-robô, limita por IP e por telefone,
// grava o lead (sem duplicar pelo telefone) e devolve o link assinado do zip, válido por 10 minutos.
import { json, erro, MSG, lerJson, mesmaOrigem, ipDe, emDev } from '../_lib/resposta.js';
import { validarNome, validarTelefone } from '../_lib/validacao.js';
import { hashComChave, tokenGratis } from '../_lib/token.js';
import { K, lerJSON, gravarJSON } from '../_lib/kv.js';
import { contar } from '../_lib/limite.js';
import { GRATIS } from '../_lib/gratis.js';
import { conferirDesafio, TTL_NONCE_S } from '../_lib/pow.js';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Confere o token do Turnstile. Em dev, o token "dev-ok" passa sem ir à Cloudflare. */
export async function conferirTurnstile(env, token, ip) {
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  if (emDev(env) && token === 'dev-ok') return true;
  if (!env.TURNSTILE_SECRET) return false;
  try {
    const corpo = new FormData();
    corpo.append('secret', env.TURNSTILE_SECRET);
    corpo.append('response', token);
    if (ip) corpo.append('remoteip', ip);
    const r = await fetch(SITEVERIFY, { method: 'POST', body: corpo });
    const d = await r.json();
    return d?.success === true;
  } catch {
    return false;
  }
}

const MSG_ROBO = {
  ausente: 'Falta a verificação anti-robô. Recarregue a página e tente de novo.',
  invalido: 'Verificação anti-robô inválida. Recarregue a página e tente de novo.',
  vencido: 'A verificação anti-robô venceu. Tente de novo.',
  solucao: 'A verificação anti-robô não confere. Recarregue a página e tente de novo.',
  reuso: 'Esta verificação já foi usada. Tente de novo.',
};

/**
 * Anti-robô: prova de trabalho {desafio, solucao} (padrão, sem conta externa) OU Turnstile
 * (só quando TURNSTILE_SECRET existe e o formulário mandou `turnstile`). Em dev, turnstile "dev-ok" passa.
 * → { ok:true } | { ok:false, msg }
 */
export async function conferirAntiRobo(env, b, ip) {
  if (b.desafio != null || b.solucao != null) {
    const v = await conferirDesafio(b.desafio, b.solucao, env.SESSAO_SEGREDO);
    if (!v.ok) return { ok: false, msg: MSG_ROBO[v.motivo] };
    const chave = `pow:${v.nonce}`;
    if ((await env.FAISCA.get(chave)) != null) return { ok: false, msg: MSG_ROBO.reuso };
    await env.FAISCA.put(chave, '1', { expirationTtl: TTL_NONCE_S });
    return { ok: true };
  }
  if (b.turnstile != null && b.turnstile !== '') {
    if (!env.TURNSTILE_SECRET && !(emDev(env) && b.turnstile === 'dev-ok')) return { ok: false, msg: MSG_ROBO.invalido };
    return (await conferirTurnstile(env, b.turnstile, ip)) ? { ok: true } : { ok: false, msg: MSG_ROBO.invalido };
  }
  return { ok: false, msg: MSG_ROBO.ausente };
}

export async function onRequestPost({ request, env }) {
  if (!mesmaOrigem(request)) return erro(MSG.invalido, 403);
  if (!env.FAISCA || !env.SESSAO_SEGREDO) return erro(MSG.indisponivel, 503);
  const b = await lerJson(request);
  if (!b) return erro(MSG.invalido, 400);

  const skill = String(b.skill || '');
  // Isca: campo escondido que gente não vê. Robô recebe "deu certo" e nada é gravado nem liberado.
  if (b.hp) return json({ ok: true, url: null });

  if (!Object.hasOwn(GRATIS, skill)) return erro('Essa skill não está entre as grátis.', 422, { campo: 'skill' });
  const n = validarNome(b.nome);
  if (!n.ok) return erro(n.msg, 422, { campo: 'nome' });
  const t = validarTelefone(b.telefone);
  if (!t.ok) return erro(t.msg, 422, { campo: 'telefone' });
  if (b.aceito !== true) return erro('Marque que você aceita receber contato para continuar.', 422, { campo: 'aceito' });

  const ip = ipDe(request);
  const [ipHash, telHash] = await Promise.all([hashComChave('ip', ip, env.SESSAO_SEGREDO), hashComChave('tel', t.telefone, env.SESSAO_SEGREDO)]);

  // Limite antes do anti-robô: não gasta verificação com quem já estourou.
  const [porIp, porTel] = await Promise.all([contar(env.FAISCA, 'lead-ip', ipHash), contar(env.FAISCA, 'lead-tel', telHash)]);
  if (!porIp.ok || !porTel.ok) return erro(MSG.muitos, 429);

  const robo = await conferirAntiRobo(env, b, ip);
  if (!robo.ok) return erro(robo.msg, 400, { campo: 'antirobo' });

  // Dedupe: o mesmo telefone reaproveita o lead que já existe.
  let leadId = await env.FAISCA.get(K.tel(telHash));
  if (!leadId || !(await lerJSON(env.FAISCA, K.lead(leadId)))) {
    leadId = crypto.randomUUID();
    const lead = { nome: n.nome, telefone: t.telefone, skill, quando: new Date().toISOString(), ipHash, ua: String(request.headers.get('user-agent') || '').slice(0, 200) };
    await gravarJSON(env.FAISCA, K.lead(leadId), lead);
    await env.FAISCA.put(K.tel(telHash), leadId);
  }

  const token = await tokenGratis(skill, leadId, env.SESSAO_SEGREDO);
  return json({ ok: true, url: `/skills/api/gratis?s=${encodeURIComponent(skill)}&t=${encodeURIComponent(token)}` });
}
