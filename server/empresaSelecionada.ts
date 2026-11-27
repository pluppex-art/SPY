// Rotas de administração que agem "na empresa": quando o master está com outra empresa selecionada, é nela que a ação vale.
// Usar depois de requireTenantAdmin, que deixa em req.tenantId a empresa de origem e em req.isMaster quem é master.

export function criarEmpresaSelecionada(resolver: (req: any, res: any) => Promise<string | null>) {
  return async (req: any, res: any, next: () => void) => {
    const pedida = typeof req.query?.tenantId === "string" ? req.query.tenantId : "";
    if (!pedida || pedida === req.tenantId) return next();
    // Chave de API e conector com segredo dão acesso duradouro aos dados: em outra empresa, só o master.
    if (!req.isMaster) return res.status(403).json({ error: "Só o master gerencia chaves de API e conectores de outra empresa. Selecione a sua empresa." });
    try {
      const tenantId = await resolver(req, res); // confere o acesso; responde o erro sozinho
      if (!tenantId) return;
      req.tenantId = tenantId;
      next();
    } catch (e: any) {
      console.error("[empresa-selecionada]", e?.message);
      res.status(500).json({ error: "Não foi possível conferir a empresa selecionada." });
    }
  };
}
