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
  odometerKm?: number;
  leasing?: LeasingSyncOptions;
}

/** Descuento del fondo de mantenimiento del leasing (Nota Débito en Renting). */
export interface LeasingSyncOptions {
  excessMethod: 'cash' | 'advance';
  advanceInstallments: number;
  advanceStartDate: string;
}

export interface RentingSyncResult {
  ok: boolean;
  status?: number;
  message?: string;
  expenseIds?: number[];
  debitNoteError?: string | null;
}

export interface LeasingResumen {
  has_leasing: boolean;
  maintenance_fund_available?: number;
  driver_name?: string | null;
}

export const CATEGORIA_CAMBIO_ACEITE = 'Cambio de aceite';

export function esCambioAceite(item: { category?: unknown; categoria_crm?: unknown } | null | undefined) {
  return item?.category === CATEGORIA_CAMBIO_ACEITE || item?.categoria_crm === 'aceite';
}

export function esKilometrajeValido(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function getRentingConfig() {
  const apiUrl = process.env.ALLATYOU_RENTING_API_URL;
  const serviceToken = process.env.ALLATYOU_RENTING_SERVICE_TOKEN?.trim();

  if (!apiUrl || !serviceToken) {
    throw new Error('Variables de entorno de Renting API no configuradas en el servidor.');
  }

  return {
    baseUrl: apiUrl.replace(/\/+$/, ''),
    authHeaders: { 'X-Service-Token': serviceToken }
  };
}

/**
 * Consulta en Renting si la placa tiene un contrato de leasing activo y su fondo de mantenimiento disponible.
 */
export async function consultarLeasingRenting(placa: string): Promise<LeasingResumen> {
  const { baseUrl, authHeaders } = getRentingConfig();

  const response = await fetch(`${baseUrl}/leasing/summary?plate=${encodeURIComponent(placa.toUpperCase().trim())}`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`Renting API respondió HTTP ${response.status} al consultar leasing`);
  }

  const data: any = await response.json();
  if (!data?.has_leasing) return { has_leasing: false };

  return {
    has_leasing: true,
    maintenance_fund_available: Math.max(0, Number(data.maintenance_fund_available ?? 0)),
    driver_name: data.driver_name ?? null
  };
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
  const { ingresoId, empresaId, placa, date, description, items, leasing, odometerKm } = params;

  const { baseUrl, authHeaders } = getRentingConfig();

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

  const payload: Record<string, any> = {
    date,
    description: description.trim(),
    items: payloadItems,
    plates: [placa.toUpperCase().trim()],
    ...(odometerKm !== undefined && { odometer_km: odometerKm })
  };

  if (leasing) {
    payload.apply_to_leasing = true;
    payload.leasing_excess_method = leasing.excessMethod;
    payload.leasing_advance_installments = leasing.advanceInstallments;
    payload.leasing_advance_start_date = leasing.advanceStartDate;
  }

  let rejectedByHub = false;
  try {
    const response = await fetch(`${baseUrl}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok && response.status !== 207) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 400) {
        rejectedByHub = true;
        let message = errorText;
        try {
          const details = JSON.parse(errorText);
          message = [details?.message, details?.error].find(value => typeof value === 'string' && value.trim()) || '';
        } catch {
          // El Hub también puede responder con texto.
        }
        throw new Error(message || 'Renting rechazó los datos del gasto.');
      }
      throw new Error(`Renting API respondió HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const resJson: any = await response.json().catch(() => null);
    const createdExpenses = resJson?.expenses || [];
    const createdIds = createdExpenses.map((e: any) => e.id);
    // 207: el gasto se creó pero la Nota Débito del leasing falló
    const debitNoteError: string | null = resJson?.debit_note_error || null;

    // Actualizar éxito en BD
    await supabase
      .from('taller_ingresos')
      .update({
        renting_expense_ids: createdIds,
        renting_sync_error: debitNoteError,
        ...(odometerKm !== undefined && { kilometraje_entrega: odometerKm })
      })
      .eq('id', ingresoId)
      .eq('empresa_id', empresaId);

    console.log(`[RentingSync] Sincronización exitosa orden #${ingresoId} -> Renting Gastos IDs: [${createdIds.join(', ')}]`);

    return {
      ok: true,
      expenseIds: createdIds,
      debitNoteError
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

    if (rejectedByHub) return { ok: false, status: 400, message: err.message };
    throw err;
  }
}
