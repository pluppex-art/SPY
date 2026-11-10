// Quem é vendedor na empresa. Antes cada tela exigia departamento === "Vendas", mas muitas empresas usam outro nome
// ("Comercial") e só aparecia quem estava com o departamento escrito exatamente assim. Agora vale o CARGO ou o
// departamento: Vendas, Comercial, Closer, Vendedor, SDR, Representante, Sales. Desligados nunca entram.
const VENDEDOR = /vend|comercial|closer|sdr|sales|representante/i;

export function isVendedorColab(c: any): boolean {
  if (!c || !String(c.nome ?? "").trim() || c.status === "Desligado") return false;
  const texto = [c.departamento, c.cargo, ...(Array.isArray(c.cargos) ? c.cargos : [])].filter(Boolean).join(" ");
  return VENDEDOR.test(texto);
}
