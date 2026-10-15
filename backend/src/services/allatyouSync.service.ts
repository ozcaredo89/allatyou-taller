import { supabase } from '../config/supabase';

export interface SincronizarGastoItem {
  item: string;
  category?: string;
  amount: number;
}

export interface SincronizarGastoParams {
  ingresoId: string;
  empresaId: string;
  placa: string;
  date: string;
  description: string;
  items: SincronizarGastoItem[];
}

export interface RentingSyncResult {
  ok: boolean;
  message?: string;
  expenseIds?: number[];
}

/**
 * Evalúa si una orden califica para sincronización con AllAtYou Renting (Flota Propia).
 * Regla de negocio: Fail-closed (si falta alguna variable de entorno o dato, retorna false).
 */
export function evaluarAplicaRenting(empresaId?: string, clienteDoc?: string): boolean {
  const targetEmpresaId = process.env.ALLATYOU_RENTING_EMPRESA_ID?.trim();
  const targetClienteDoc = process.env.ALLATYOU_RENTING_CLIENTE_DOC?.trim();

  if (!targetEmpresaId || !targetClienteDoc || !empresaId || !clienteDoc) {
    return false;
  }

  return empresaId === targetEmpresaId && String(clienteDoc).trim() === targetClienteDoc;
}

/**
 * Reclama de forma atómica la orden e invoca el endpoint POST /expenses de Renting.
 * Si tiene éxito, persiste los IDs de los gastos creados.
 * Si falla, revierte el reclamo (renting_sync_at = null) y persiste el mensaje de error.
 */
export async function procesarSincronizacionRenting(params: SincronizarGastoParams): Promise<RentingSyncResult> {
  const { ingresoId, empresaId, placa, date, description, items } = params;

  const apiUrl = process.env.ALLATYOU_RENTING_API_URL;
  const user = process.env.ALLATYOU_RENTING_USER;
  const pass = process.env.ALLATYOU_RENTING_PASS;

  if (!apiUrl || !user || !pass) {
    throw new Error('Variables de entorno de Renting API no configuradas en el servidor.');
  }

  // 1. Reclamo Atómico (Optimistic Lock)
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await supabase
    .from('taller_ingresos')
    .update({ renting_sync_at: nowIso })
    .eq('id', ingresoId)
    .eq('empresa_id', empresaId)
    .is('renting_sync_at', null)
    .select('id')
    .maybeSingle();

  if (claimErr) {
    console.error(`[RentingSync] Error en reclamo atómico orden #${ingresoId}:`, claimErr.message);
    throw new Error(`Error en base de datos al reclamar la orden: ${claimErr.message}`);
  }

  if (!claimed) {
    return {
      ok: false,
      message: 'Esta orden ya fue sincronizada previamente o se encuentra en proceso de sincronización.'
    };
  }

  // 2. Preparar payload validado para Renting
  const payloadItems = items.map(i => ({
    item: i.item.trim(),
    category: i.category || 'Mantenimiento',
    amount: Number(i.amount.toFixed(2))
  }));

  const payload = {
    date,
    description: description.trim(),
    items: payloadItems,
    plates: [placa.toUpperCase().trim()]
  };

  const authHeader = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

  try {
    const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok && response.status !== 207) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Renting API respondió HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const resJson: any = await response.json().catch(() => null);
    const createdExpenses = resJson?.created_expenses || [];
    const createdIds = createdExpenses.map((e: any) => e.id);

    // Actualizar éxito en BD
    await supabase
      .from('taller_ingresos')
      .update({
        renting_expense_ids: createdIds,
        renting_sync_error: null
      })
      .eq('id', ingresoId)
      .eq('empresa_id', empresaId);

    console.log(`[RentingSync] Sincronización exitosa orden #${ingresoId} -> Renting Gastos IDs: [${createdIds.join(', ')}]`);

    return {
      ok: true,
      expenseIds: createdIds
    };
  } catch (err: any) {
    console.error(`[RentingSync] Fallo en sincronización de orden #${ingresoId}:`, err.message);

    // Revertir el reclamo para permitir reintentos manuales y registrar el error
    await supabase
      .from('taller_ingresos')
      .update({
        renting_sync_at: null,
        renting_sync_error: err.message
      })
      .eq('id', ingresoId)
      .eq('empresa_id', empresaId);

    throw err;
  }
}
