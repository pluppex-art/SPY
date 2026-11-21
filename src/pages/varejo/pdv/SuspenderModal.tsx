import { useEffect, useState } from "react";
import { Lock, PauseCircle, Trash2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { apiFetch } from "../../../lib/apiClient";

interface Item { productId: string; name: string; quantidade: number }
interface Props {
  isOpen: boolean;
  /** "cancelar" abre direto na confirmação por senha para cancelar a venda inteira (atalho F8). */
  modoInicial: "normal" | "cancelar";
  onClose: () => void;
  itens: Item[];
  tenantId: string | null;
  /** false = o gestor desligou a senha: remover e cancelar executam direto. */
  exigirSenha: boolean;
  onEspera: () => void;
  onRemover: (productIds: string[], motivo: string) => void;
  onCancelarVenda: (motivo: string) => void;
}

const inputCls = "w-full px-3 py-2 text-sm bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500";

/** Suspender: colocar em espera, remover itens ou cancelar a venda. Remover e cancelar exigem a senha de supervisor. */
export function SuspenderModal({ isOpen, modoInicial, onClose, itens, tenantId, exigirSenha, onEspera, onRemover, onCancelarVenda }: Props) {
  const [etapa, setEtapa] = useState<"escolher" | "senha">("escolher");
  const [acao, setAcao] = useState<"remover" | "cancelar">("remover");
  const [sel, setSel] = useState<string[]>([]);
  const [senha, setSenha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<{ msg: string; semSenha?: boolean } | null>(null);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSel([]); setSenha(""); setMotivo(""); setErro(null); setVerificando(false);
    if (modoInicial === "cancelar") { setAcao("cancelar"); setEtapa("senha"); } else { setEtapa("escolher"); }
  }, [isOpen, modoInicial]);

  const alternar = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const irParaSenha = (a: "remover" | "cancelar") => {
    // Sem senha exigida: remover executa direto; cancelar pede só uma confirmação.
    if (!exigirSenha && a === "remover") { onRemover(sel, ""); onClose(); return; }
    setAcao(a); setSenha(""); setErro(null); setEtapa("senha");
  };

  const confirmar = async () => {
    if (!exigirSenha) { onCancelarVenda(motivo); onClose(); return; }
    if (!senha) { setErro({ msg: "Digite a senha de supervisor." }); return; }
    setVerificando(true); setErro(null);
    try {
      const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
      const r = await apiFetch(`/api/varejo/supervisor-senha/verificar${q}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        if (acao === "remover") onRemover(sel, motivo); else onCancelarVenda(motivo);
        onClose();
        return;
      }
      if (j.code === "sem_senha") setErro({ msg: "O gestor ainda não definiu a senha de supervisor.", semSenha: true });
      else setErro({ msg: j.error || "Não foi possível conferir a senha." });
      setSenha("");
    } catch {
      setErro({ msg: "Sem conexão com o servidor. Tente de novo." });
    } finally { setVerificando(false); }
  };

  const qtdSel = itens.filter((i) => sel.includes(i.productId)).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Suspender venda" maxWidth="max-w-md"
      description={etapa === "escolher" ? "Coloque a venda em espera, remova itens ou cancele a compra." : undefined}
      footer={etapa === "senha" ? (
        <div className="flex justify-end gap-2">
          {modoInicial !== "cancelar" && <Button variant="outline" onClick={() => setEtapa("escolher")}>Voltar</Button>}
          <Button onClick={confirmar} loading={verificando} className="bg-red-600 hover:bg-red-700 text-white">
            {acao === "cancelar" ? "Cancelar venda" : `Remover ${qtdSel === 1 ? "item" : "itens"}`}
          </Button>
        </div>
      ) : undefined}
    >
      {etapa === "escolher" ? (
        <div className="space-y-3">
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
            {itens.map((i) => (
              <label key={i.productId} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] cursor-pointer">
                <input type="checkbox" checked={sel.includes(i.productId)} onChange={() => alternar(i.productId)} />
                <span className="flex-1 min-w-0 text-xs font-bold text-[var(--color-text-primary)] truncate">{i.name}</span>
                <span className="text-xs font-mono text-[var(--color-text-muted)]">{i.quantidade} un.</span>
              </label>
            ))}
            {itens.length === 0 && <p className="py-6 text-center text-xs text-[var(--color-text-muted)]">O carrinho está vazio.</p>}
          </div>
          <div className="grid gap-2 pt-1 border-t border-[var(--color-border-subtle)]">
            <Button variant="outline" className="gap-1.5 justify-start border-amber-500/30 text-amber-500 hover:bg-amber-500/10" disabled={itens.length === 0}
              onClick={() => { onEspera(); onClose(); }}>
              <PauseCircle className="w-4 h-4" /> Colocar a venda em espera
            </Button>
            <Button variant="outline" className="gap-1.5 justify-start" disabled={qtdSel === 0} onClick={() => irParaSenha("remover")}>
              <Trash2 className="w-4 h-4" /> Remover {qtdSel > 0 ? `${qtdSel} ${qtdSel === 1 ? "item selecionado" : "itens selecionados"}` : "itens selecionados"} {exigirSenha && <Lock className="w-3 h-3 ml-auto opacity-60" />}
            </Button>
            <Button variant="outline" className="gap-1.5 justify-start border-red-500/30 text-red-500 hover:bg-red-500/10" disabled={itens.length === 0} onClick={() => irParaSenha("cancelar")}>
              <XCircle className="w-4 h-4" /> Cancelar a venda inteira {exigirSenha && <Lock className="w-3 h-3 ml-auto opacity-60" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {acao === "cancelar"
              ? `Isso cancela a venda inteira (${itens.length} ${itens.length === 1 ? "item" : "itens"}).${exigirSenha ? " Peça a senha de supervisor para confirmar." : ""}`
              : `Isso remove ${qtdSel} ${qtdSel === 1 ? "item" : "itens"} da venda. Peça a senha de supervisor para confirmar.`}
          </p>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Motivo (opcional)</label>
            <input type="text" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente desistiu, erro de digitação" className={inputCls} />
          </div>
          {exigirSenha && <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mb-1 flex items-center gap-1"><Lock className="w-3 h-3" /> Senha de supervisor</label>
            <input autoFocus type="password" autoComplete="off" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void confirmar(); } }} className={inputCls} />
          </div>}
          {erro && (
            <p className="text-xs font-semibold text-red-500">
              {erro.msg} {erro.semSenha && <Link to="/app/configuracoes/varejo/pdv" className="underline" onClick={onClose}>Abrir configurações</Link>}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
