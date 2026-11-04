import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, Search, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Troca de empresa (tenant) no celular, para o master e para usuários de organização parceira.
 * Botão na barra superior que abre uma lista em tela cheia (nomes completos, com busca).
 * Quem não pode trocar de empresa não vê nada. No desktop a troca continua no menu lateral.
 */
export function TenantSwitcherMobile() {
  const { user, tenantIdMap, activeTenantId, activeTenantName, switchTenant } = useAuth();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const opcoes = useMemo(
    () => Object.entries(tenantIdMap || {}).map(([name, id]) => ({ id: id as string, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [tenantIdMap],
  );
  const podeTrocar = (!!user?.isMaster || !!user?.partnerId) && opcoes.length > 1;
  if (!podeTrocar) return null;

  const termo = busca.trim().toLowerCase();
  const filtradas = termo ? opcoes.filter((o) => o.name.toLowerCase().includes(termo)) : opcoes;
  const fechar = () => { setOpen(false); setBusca(""); };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Trocar de empresa. Atual: ${activeTenantName || user?.tenantName || ""}`}
        className="md:hidden w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-none cursor-pointer active:scale-95"
      >
        <Building2 className="w-5 h-5" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[95] flex flex-col justify-end md:hidden" role="dialog" aria-modal="true" aria-label="Trocar de empresa">
          <div className="absolute inset-0 bg-black/50" onClick={fechar} />
          <div className="relative max-h-[85dvh] flex flex-col bg-[var(--color-surface-elevated)] rounded-t-[var(--radius-panel-lg)] shadow-[var(--shadow-panel)] pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-black text-[var(--color-text-primary)]">Trocar de empresa</h2>
                <p className="text-xs text-[var(--color-text-muted)] break-words">Atual: {activeTenantName || user?.tenantName}</p>
              </div>
              <button type="button" onClick={fechar} aria-label="Fechar" className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-transparent border-none text-[var(--color-text-muted)] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {opcoes.length > 6 && (
              <div className="relative px-4 pb-2 shrink-0">
                <Search className="w-4 h-4 absolute left-7 top-1/2 -translate-y-[60%] text-[var(--color-text-faint)]" />
                <input
                  type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa..."
                  className="w-full h-11 pl-10 pr-3 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]"
                />
              </div>
            )}

            <ul className="overflow-y-auto overscroll-contain px-2 pb-4">
              {filtradas.map((o) => {
                const ativa = o.id === activeTenantId;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => { if (!ativa) switchTenant(o.id, o.name); fechar(); }}
                      className={`w-full min-h-12 flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-left border-none cursor-pointer ${ativa ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] font-black" : "bg-transparent text-[var(--color-text-primary)] font-semibold"}`}
                    >
                      <Building2 className="w-4 h-4 shrink-0" />
                      <span className="flex-1 min-w-0 text-sm break-words">{o.name}</span>
                      {ativa && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
              {filtradas.length === 0 && <li className="px-3 py-8 text-center text-xs text-[var(--color-text-faint)]">Nenhuma empresa encontrada.</li>}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
