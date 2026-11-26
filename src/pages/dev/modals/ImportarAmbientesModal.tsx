import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../../components/ui/modal';
import { Button } from '../../../components/ui/button';
import type { SugestaoAmbiente } from '../lib/ambientes';

interface Props {
  aberto: boolean;
  onClose: () => void;
  buscar: () => Promise<SugestaoAmbiente[]>;
  jaCadastrado: (s: SugestaoAmbiente) => boolean;
  onImportar: (s: SugestaoAmbiente[]) => Promise<boolean>;
}

export function ImportarAmbientesModal({ aberto, onClose, buscar, jaCadastrado, onImportar }: Props) {
  const [lista, setLista] = useState<SugestaoAmbiente[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    let valeu = true;
    setLista(null); setErro(''); setMarcados(new Set());
    buscar()
      .then((s) => { if (valeu) { setLista(s); setMarcados(new Set(s.filter(jaCadastrado).map((x) => x.chave))); } })
      .catch((e) => { if (valeu) setErro(e instanceof TypeError ? 'Sem resposta do GitHub. Verifique a conexão.' : e.message); });
    return () => { valeu = false; };
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (chave: string) => setMarcados((m) => { const n = new Set(m); n.has(chave) ? n.delete(chave) : n.add(chave); return n; });
  const todos = !!lista?.length && marcados.size === lista.length;

  const importar = async () => {
    setSalvando(true);
    const ok = await onImportar((lista ?? []).filter((s) => marcados.has(s.chave)));
    setSalvando(false);
    if (ok) onClose();
  };

  return (
    <Modal isOpen={aberto} onClose={onClose} maxWidth="max-w-2xl" title="Importar do GitHub" description="Publicações e sites registrados nos seus repositórios. Marque os que quer acompanhar."
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <button type="button" disabled={!lista?.length} onClick={() => setMarcados(todos ? new Set() : new Set(lista!.map((s) => s.chave)))} className="text-xs font-bold text-[var(--color-primary-blue)] cursor-pointer bg-transparent border-none disabled:opacity-40">{todos ? 'Desmarcar todos' : 'Marcar todos'}</button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="h-10 px-5 text-xs font-bold">Cancelar</Button>
            <Button onClick={importar} disabled={salvando || !marcados.size} className="h-10 px-6 text-xs font-bold">{salvando ? 'Importando…' : `Importar ${marcados.size || ''}`}</Button>
          </div>
        </div>
      }
    >
      {erro ? <p className="text-xs text-rose-500 break-words">{erro}</p>
        : !lista ? <div className="flex items-center justify-center gap-2 py-8 text-xs font-bold text-[var(--color-text-muted)]"><Loader2 className="w-4 h-4 animate-spin" /> Buscando no GitHub...</div>
        : !lista.length ? <p className="text-xs text-[var(--color-text-muted)] py-4">Nenhum repositório tem publicação registrada nem site informado. Cadastre o ambiente à mão.</p>
        : (
          <ul className="space-y-2">
            {lista.map((s) => (
              <li key={s.chave}>
                <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 cursor-pointer">
                  <input type="checkbox" checked={marcados.has(s.chave)} onChange={() => alternar(s.chave)} className="mt-0.5 accent-[var(--color-primary-blue)]" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-black text-[var(--color-text-primary)] break-words">{s.nome} <span className="font-medium text-[var(--color-text-muted)]">· {s.tipo}</span></span>
                    <span className="block text-[11px] font-mono text-[var(--color-text-muted)] break-all">{s.url}</span>
                    <span className="block text-[10px] text-[var(--color-text-faint)]">{s.publicadoEm ? `Publicado em ${new Date(s.publicadoEm).toLocaleDateString('pt-BR')} · ${s.versao}` : 'Sem publicação registrada'}{jaCadastrado(s) ? ' · já cadastrado (atualiza versão e data)' : ''}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
    </Modal>
  );
}
