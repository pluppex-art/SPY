import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '../../../components/ui/modal';
import { Button } from '../../../components/ui/button';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  projectName?: string;
};

export function ApagarProjetoDevModal({ isOpen, onClose, onConfirm, projectName }: Props) {
  const [loading, setLoading] = useState(false);
  const canConfirm = useMemo(() => !loading, [loading]);

  async function handleConfirm() {
    if (!canConfirm) return;
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-lg"
      title={
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-600/10 border border-red-500/20 flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <div className="text-base font-black text-white">Apagar Projeto</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Dev & Tecnologia</div>
          </div>
        </div>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white" disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} className="bg-red-600 hover:bg-red-700 text-white font-bold px-6" disabled={!canConfirm}>
            {loading ? 'Apagando...' : 'Apagar Definitivamente'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-slate-300">
          Tem certeza que deseja apagar o projeto <span className="font-black text-white">{projectName ?? ''}</span>?<br />
          Isso também removerá as tasks vinculadas.
        </div>
        <div className="text-[10px] text-slate-500">
          Recomendação: use essa ação com cuidado. Não há desfazer.
        </div>
      </div>
    </Modal>
  );
}

