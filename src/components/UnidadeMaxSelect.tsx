import { useUnidadeMax, type UnidadeMax } from "../lib/unidadeMaxdata";
import { useAuth } from "../contexts/AuthContext";
import { MAXDATA_ORIGENS, useMaxdataDisponivel } from "../lib/useMaxdataPage";

/** Escolhe a unidade (loja principal ou filial) cujos dados os painéis da Max Data mostram. */
export default function UnidadeMaxSelect({ className = "" }: { className?: string }) {
  const { activeTenantId } = useAuth();
  const { disponivel } = useMaxdataDisponivel(activeTenantId);
  const [u, setU] = useUnidadeMax();
  if (!disponivel) return null;
  const rot = (v: string) => MAXDATA_ORIGENS.find((o) => o.value === v)?.label ?? v;
  return (
    <select value={u} onChange={(e) => setU(e.target.value as UnidadeMax)} title="Unidade"
      className={`h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium ${className}`}>
      <option value="">Todas as unidades</option>
      <option value="maxdata:estoque">{rot("maxdata:estoque")}</option>
      <option value="maxdata:notas">{rot("maxdata:notas")}</option>
    </select>
  );
}
