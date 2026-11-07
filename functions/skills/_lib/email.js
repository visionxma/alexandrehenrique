// Envio do código de acesso por e-mail, com provedor abstrato.
// Provedores, nesta ordem: (1) Worker interno `faisca-email` (service binding MAIL, Cloudflare Email Sending, sem chave);
// (2) Resend quando RESEND_API_KEY existe. Sem provedor, não envia e diz por quê.
// Nunca registra em log o código nem o e-mail inteiro.

export function montarEmailCodigo(codigo) {
  const assunto = `Seu código de acesso à Faísca: ${codigo}`;
  const texto = [
    'Olá!',
    '',
    `Seu código para entrar na área de membros da Faísca é: ${codigo}`,
    '',
    'Ele vale por 10 minutos e só pode ser usado uma vez.',
    'Se não foi você que pediu, ignore este e-mail: ninguém entra sem o código.',
  ].join('\n');
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5">
<p>Olá!</p>
<p>Seu código para entrar na área de membros da <strong>Faísca</strong> é:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${codigo}</p>
<p>Ele vale por 10 minutos e só pode ser usado uma vez.</p>
<p style="color:#666;font-size:13px">Se não foi você que pediu, ignore este e-mail: ninguém entra sem o código.</p>
</body></html>`;
  return { assunto, texto, html };
}

/** → { ok:true, provedor } | { ok:false, motivo } */
export async function enviarCodigo(env, email, codigo) {
  if (env.MAIL && typeof env.MAIL.fetch === 'function') {
    const { assunto, texto, html } = montarEmailCodigo(codigo);
    try {
      const r = await env.MAIL.fetch('https://faisca-email/enviar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ para: email, assunto, texto, html }) });
      if (!r.ok) return { ok: false, motivo: `mail-${r.status}` };
      return { ok: true, provedor: 'cloudflare-email' };
    } catch {
      return { ok: false, motivo: 'mail-rede' };
    }
  }
  if (!env.RESEND_API_KEY) return { ok: false, motivo: 'sem-provedor' };
  if (!env.EMAIL_REMETENTE) return { ok: false, motivo: 'sem-remetente' };
  const { assunto, texto, html } = montarEmailCodigo(codigo);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_REMETENTE, to: [email], subject: assunto, text: texto, html }),
    });
    if (!r.ok) return { ok: false, motivo: `resend-${r.status}` };
    return { ok: true, provedor: 'resend' };
  } catch {
    return { ok: false, motivo: 'rede' };
  }
}
