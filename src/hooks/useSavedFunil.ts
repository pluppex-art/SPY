import { useEffect, useRef } from "react";

// Lembra o funil que o usuário escolheu no Pipeline (por empresa, neste aparelho) e o restaura depois de recarregar.
// Os funis da empresa chegam DEPOIS do primeiro desenho da tela; por isso a escolha salva fica "pendente" e é aplicada assim que
// o funil aparecer na lista. Só a escolha do usuário é gravada (`salvar`); correções automáticas não, senão o padrão apagaria a
// escolha antes de os funis carregarem.
export function useSavedFunil(
  storageKey: string | null,
  funis: { id: string; tipo?: string }[],
  bloqueado: boolean,
  aplicar: (f: { id: string; tipo?: string } | "__todos__") => void,
) {
  const pendente = useRef<string | null>(null);
  const restaurado = useRef(false);

  useEffect(() => {
    restaurado.current = false;
    pendente.current = null;
    try { if (storageKey) pendente.current = localStorage.getItem(storageKey); } catch { /* sem storage */ }
  }, [storageKey]);

  useEffect(() => {
    if (restaurado.current || bloqueado) return;
    const id = pendente.current;
    if (!id) { restaurado.current = true; return; }
    if (id === "__todos__") { aplicar("__todos__"); restaurado.current = true; return; }
    const f = funis.find((x) => x.id === id);
    if (!f) return; // ainda não carregou (ou foi apagado): tenta de novo quando a lista mudar
    aplicar(f);
    restaurado.current = true;
  }, [funis, storageKey, bloqueado]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Chame quando o USUÁRIO escolher um funil: grava e impede a restauração de passar por cima. */
  const salvar = (id: string) => {
    restaurado.current = true;
    try { if (storageKey) localStorage.setItem(storageKey, id); } catch { /* sem storage */ }
  };
  return { salvar };
}
