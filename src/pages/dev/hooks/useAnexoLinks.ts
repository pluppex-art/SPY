import { useEffect, useState } from 'react';
import { linksDosAnexos, urlSegura, type Anexo } from '../lib/anexos';

/** Devolve uma função anexo → URL para exibir (assina de uma vez os arquivos do bucket privado). */
export function useAnexoLinks(anexos: Anexo[]) {
  const chave = anexos.map(a => a.path).filter(Boolean).sort().join('|');
  const [links, setLinks] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    if (!chave) return;
    linksDosAnexos(chave.split('|')).then(l => { if (vivo) setLinks(prev => ({ ...prev, ...l })); });
    return () => { vivo = false; };
  }, [chave]);
  return (a: Anexo) => (a.path ? links[a.path] : urlSegura(a.url));
}
