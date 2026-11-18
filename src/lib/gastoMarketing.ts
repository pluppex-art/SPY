/** Uma despesa do Financeiro conta como investimento em marketing? Mesma regra em Campanhas, Analytics e nos resumos do servidor. */
export function ehGastoMarketing(categoria: string | null | undefined): boolean {
  const c = String(categoria ?? "").toLowerCase();
  return /marketing|an[uú]ncio|tr[aá]fego|publicidade|propaganda|\bads\b|meta ads|google ads|influenc/.test(c);
}
