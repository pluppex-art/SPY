import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'sonner';
import { useClinicaConfig } from '../../../lib/modules/clinicaConfig';

export interface EstoqueItem {
  id: string | number;
  name: string;
  category: string;
  qty: number;
  minQty: number;
  status: string;
  price: string;
}

function computeStatus(qty: number, minQty: number, pctCritico = 50): string {
  if (qty === 0) return 'Crítico';
  if (qty < minQty) return qty < minQty * (pctCritico / 100) ? 'Crítico' : 'Alerta';
  return 'Normal';
}

function rowToItem(row: any): EstoqueItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'Geral',
    qty: row.qty ?? 0,
    minQty: row.min_qty ?? 0,
    status: row.status || computeStatus(row.qty ?? 0, row.min_qty ?? 0),
    price: row.price || 'R$ 0,00',
  };
}

export function useEstoque() {
  const { activeTenantId } = useAuth();
  const pctCritico = useClinicaConfig().estoque.percentualCritico;
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase || !activeTenantId) return;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase!
        .from('estoque_items')
        .select('*')
        .eq('tenant_id', activeTenantId)
        .order('name', { ascending: true });
      if (!error && data !== null) {
        setItems(data.map(rowToItem));
      }
      setLoading(false);
    }
    load();
  }, [activeTenantId]);

  async function addItem(payload: { name: string; category: string; qty: number; minQty: number; price: string }) {
    const status = computeStatus(payload.qty, payload.minQty, pctCritico);
    if (!supabase || !activeTenantId) {
      setItems(prev => [...prev, { id: Date.now(), ...payload, status }]);
      toast.success('Item adicionado!');
      return;
    }
    const { data, error } = await supabase
      .from('estoque_items')
      .insert({ tenant_id: activeTenantId, name: payload.name, category: payload.category, qty: payload.qty, min_qty: payload.minQty, price: payload.price, status })
      .select()
      .maybeSingle();
    if (error) { toast.error('Erro ao adicionar item'); return; }
    if (data) {
      setItems(prev => [...prev, rowToItem(data)]);
      toast.success('Item adicionado!');
    }
  }

  return { items, loading, addItem };
}
