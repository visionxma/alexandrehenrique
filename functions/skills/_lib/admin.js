// Quem é ADMIN da área de membros. Só estes e-mails entram sem compra e enxergam leads e compradores.
export const ADMINS = ['visionxma@gmail.com'];

/** true só para e-mail da lista (compara em minúsculas, sem espaços nas pontas); qualquer outro valor é false. */
export function ehAdmin(email) {
  if (typeof email !== 'string') return false;
  return ADMINS.includes(email.trim().toLowerCase());
}
