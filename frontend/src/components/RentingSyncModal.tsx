import appI18n from "../i18n";
import React, { useEffect, useState } from 'react';
import { 
  X, 
  Send, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Lock, 
  Plus, 
  Trash2, 
  Calendar, 
  Car, 
  FileText,
  Wallet
} from 'lucide-react';
import api from '../services/api';
import { esCambioAceite } from '../services/rentingOdometer';

export interface RentingSyncItem {
  item: string;
  category?: string;
  amount: number;
}

interface LeasingInfo {
  has_leasing: boolean;
  maintenance_fund_available?: number;
  driver_name?: string | null;
}

interface RentingSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  ingresoId: string;
  placa: string;
  initialDate?: string;
  initialDescription?: string;
  initialItems: RentingSyncItem[];
  kilometrajeEntrega?: number;
  requiereOdometro?: boolean;
  onSuccess?: () => void;
}

export const RentingSyncModal: React.FC<RentingSyncModalProps> = ({
  isOpen,
  onClose,
  ingresoId,
  placa,
  initialDate,
  initialDescription,
  initialItems,
  kilometrajeEntrega,
  requiereOdometro,
  onSuccess
}) => {
  const defaultDate = initialDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

  const [date, setDate] = useState<string>(defaultDate);
  const [description, setDescription] = useState<string>(initialDescription || `Reparación Taller [${placa}]`);
  const [items, setItems] = useState<RentingSyncItem[]>(
    initialItems.length > 0 ? initialItems : [{ item: 'Mano de Obra / Reparación', category: 'Mantenimiento', amount: 0 }]
  );

  const [loading, setLoading] = useState(false);
  const [lectura, setLectura] = useState(kilometrajeEntrega?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  // Leasing: si la placa tiene contrato activo, permitir descontar del fondo de mantenimiento
  const [leasingInfo, setLeasingInfo] = useState<LeasingInfo | null>(null);
  const [leasingLoading, setLeasingLoading] = useState(true);
  const [leasingCheckError, setLeasingCheckError] = useState(false);
  const [applyToLeasing, setApplyToLeasing] = useState(true);
  const [excessMethod, setExcessMethod] = useState<'cash' | 'advance'>('cash');
  const [advanceInstallments, setAdvanceInstallments] = useState(10);
  const [advanceStartDate, setAdvanceStartDate] = useState<string>(defaultDate);

  const cargarLeasing = async () => {
    setLeasingLoading(true);
    setLeasingCheckError(false);
    try {
      const { data } = await api.get<LeasingInfo>(`/ingresos/${ingresoId}/renting-leasing`);
      setLeasingInfo(data);
    } catch {
      setLeasingInfo(null);
      setLeasingCheckError(true);
    } finally {
      setLeasingLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) cargarLeasing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ingresoId]);

  const handleItemChange = (index: number, field: keyof RentingSyncItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleAddItem = () => {
    setItems([...items, { item: '', category: 'Mantenimiento', amount: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setError(appI18n.t('ui.RentingSyncModal.keep_at_least_one_item'));
      return;
    }
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
  };

  const totalAmount = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  const tieneLeasing = Boolean(leasingInfo?.has_leasing);
  const fondoDisponible = Number(leasingInfo?.maintenance_fund_available ?? 0);
  const cubiertoFondo = Math.min(totalAmount, fondoDisponible);
  const excedente = Math.max(0, totalAmount - fondoDisponible);
  const usarLeasing = tieneLeasing && applyToLeasing;
  const mostrarOdometro = requiereOdometro || items.some(esCambioAceite);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validaciones
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError(appI18n.t('ui.RentingSyncModal.select_a_valid_date_yyyy_mm_dd'));
      return;
    }

    if (!description.trim()) {
      setError(appI18n.t('ui.RentingSyncModal.enter_an_expense_description'));
      return;
    }

    if (items.length === 0) {
      setError(appI18n.t('ui.RentingSyncModal.add_at_least_one_item'));
      return;
    }

    for (const it of items) {
      if (!it.item.trim()) {
        setError(appI18n.t('ui.RentingSyncModal.all_items_must_have_a_description'));
        return;
      }
      if (typeof it.amount !== 'number' || isNaN(it.amount) || it.amount <= 0) {
        setError(`El ítem "${it.item || 'sin nombre'}" debe tener un valor mayor a cero`);
        return;
      }
    }

    const kilometraje = Number(lectura);
    if (mostrarOdometro && (!Number.isFinite(kilometraje) || kilometraje <= 0)) {
      setError('Ingresa el kilometraje del tablero en km, mayor a cero.');
      return;
    }
    setLoading(true);

    try {
      const { data } = await api.post(`/ingresos/${ingresoId}/renting-sync`, {
        ...(usarLeasing && {
          apply_to_leasing: true,
          leasing_excess_method: excessMethod,
          leasing_advance_installments: advanceInstallments,
          leasing_advance_start_date: advanceStartDate
        }),
        date,
        ...(mostrarOdometro && { odometer_km: kilometraje }),
        description: description.trim(),
        items: items.map(it => ({
          item: it.item.trim(),
          category: it.category || 'Mantenimiento',
          amount: Number(it.amount)
        }))
      });

      setSuccess(true);
      if (data?.debit_note_error) {
        // El gasto quedó creado pero sin Nota Débito: no cerrar automáticamente
        setWarning(data.debit_note_error);
        if (onSuccess) onSuccess();
        return;
      }
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      const serverMsg = err.response?.data?.error || err.message || 'Error al conectar con Renting';
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">{appI18n.t("ui.RentingSyncModal.record_expense_in_allatyou_fleet")}</h3>
              <p className="text-xs text-slate-400">{appI18n.t("ui.RentingSyncModal.review_parts_and_labor_before_syncing")}</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>{appI18n.t("ui.RentingSyncModal.expense_created_in_allatyou_renting_hub")}</span>
            </div>
          )}

          {warning && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
              <span>{warning} {appI18n.t("ui.RentingSyncModal.create_the_debit_note_manually_in_renting")}</span>
            </div>
          )}

          {/* Fila: Placa y Fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Placa (Solo Lectura) */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5" />
                {appI18n.t("ui.RentingSyncModal.vehicle_license_plate")}
                <span className="text-slate-500 text-[10px] flex items-center gap-0.5 ml-auto">
                  <Lock className="w-3 h-3" /> {appI18n.t("ui.RentingSyncModal.read_only")}
                </span>
              </label>
              <input
                type="text"
                value={placa}
                disabled
                className="w-full bg-slate-950/60 border border-slate-800 text-amber-300 font-mono font-bold tracking-wider rounded-xl px-3.5 py-2.5 text-sm opacity-90 cursor-not-allowed"
              />
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {appI18n.t("ui.RentingSyncModal.expense_date_bogot_time")}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-slate-950/40 border border-slate-700/70 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white transition-all outline-hidden"
              />
            </div>
          </div>

          {mostrarOdometro && (
            <label className="block text-xs font-medium text-slate-300">
              {appI18n.t("ui.RentingSyncModal.odometer_reading_km")}
              <input
                type="number"
                step="any"
                value={lectura}
                onChange={(e) => setLectura(e.target.value)}
                required
                disabled={loading || success}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/40 px-3.5 py-2.5 text-sm text-white"
              />
            </label>
          )}

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {appI18n.t("ui.RentingSyncModal.general_description")}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={appI18n.t("ui.RentingSyncModal.e_g_brake_maintenance_order")}
              required
              className="w-full bg-slate-950/40 border border-slate-700/70 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white transition-all outline-hidden"
            />
          </div>

          {/* Tabla de Ítems */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                {appI18n.t("ui.RentingSyncModal.parts_and_labor_details")}
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-amber-400/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {appI18n.t("ui.RentingSyncModal.add_item")}
              </button>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/30">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-3.5 py-2.5">{appI18n.t("ui.RentingSyncModal.description_part")}</th>
                    <th className="px-3.5 py-2.5 w-36 text-right">{appI18n.t("ui.RentingSyncModal.amount_cop")}</th>
                    <th className="w-10 px-2 py-2.5 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-2">
                        <input
                          type="text"
                          value={it.item}
                          onChange={(e) => handleItemChange(idx, 'item', e.target.value)}
                          placeholder={appI18n.t("ui.RentingSyncModal.item_description")}
                          required
                          className="w-full bg-transparent border-0 focus:ring-0 text-slate-200 text-xs py-1 px-1.5"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={it.amount === 0 ? '' : it.amount}
                          onChange={(e) => handleItemChange(idx, 'amount', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          min="1"
                          required
                          className="w-full bg-slate-900/80 border border-slate-700/60 focus:border-amber-500 rounded-lg text-right text-emerald-400 font-mono text-xs py-1 px-2 outline-hidden"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={items.length <= 1}
                          className="text-slate-500 hover:text-rose-400 disabled:opacity-30 disabled:hover:text-slate-500 p-1 rounded-md transition-colors"
                          title={appI18n.t("ui.RentingSyncModal.remove_item")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-950/80 border-t border-slate-800">
                  <tr>
                    <td className="px-3.5 py-2.5 font-medium text-slate-300">{appI18n.t("ui.RentingSyncModal.total_to_sync")}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-sm text-emerald-400">
                      ${totalAmount.toLocaleString('es-CO')}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Leasing: descuento del fondo de mantenimiento */}
          {leasingLoading && (
            <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800 text-slate-400 text-xs flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {appI18n.t("ui.RentingSyncModal.checking_whether_the_vehicle_has_an_active_lease")}
            </div>
          )}

          {!leasingLoading && leasingCheckError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3">
              <span>{appI18n.t("ui.RentingSyncModal.could_not_verify_whether_the_vehicle_has_a")}</span>
              <button type="button" onClick={cargarLeasing} className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-medium">
                {appI18n.t("ui.RentingSyncModal.retry")}
              </button>
            </div>
          )}

          {!leasingLoading && tieneLeasing && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/30 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="text-sm font-semibold text-amber-300">{appI18n.t("ui.RentingSyncModal.vehicle_with_an_active_lease")}</p>
                    {leasingInfo?.driver_name && <p className="text-xs text-slate-400">{appI18n.t("ui.RentingSyncModal.driver")} {leasingInfo.driver_name}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{appI18n.t("ui.RentingSyncModal.available_maintenance_fund")}</p>
                  <p className="font-mono font-bold text-amber-300">${fondoDisponible.toLocaleString('es-CO')}</p>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyToLeasing}
                  onChange={(e) => setApplyToLeasing(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-500 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-xs text-slate-200">{appI18n.t("ui.RentingSyncModal.deduct_from_the_maintenance_fund_and_issue_a")}</span>
              </label>

              {applyToLeasing && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-950/50 border border-emerald-500/20 flex justify-between">
                    <span className="text-slate-400">{appI18n.t("ui.RentingSyncModal.covered_by_the_fund")}</span>
                    <span className="font-mono font-bold text-emerald-400">${cubiertoFondo.toLocaleString('es-CO')}</span>
                  </div>
                  <div className={`p-2.5 rounded-lg bg-slate-950/50 border flex justify-between ${excedente > 0 ? 'border-rose-500/40' : 'border-slate-800'}`}>
                    <span className="text-slate-400">{appI18n.t("ui.RentingSyncModal.shortfall")}</span>
                    <span className={`font-mono font-bold ${excedente > 0 ? 'text-rose-400' : 'text-slate-300'}`}>${excedente.toLocaleString('es-CO')}</span>
                  </div>
                </div>
              )}

              {applyToLeasing && excedente > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-rose-300">{appI18n.t("ui.RentingSyncModal.the_fund_cannot_cover_the_full_amount_how")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExcessMethod('cash')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${excessMethod === 'cash' ? 'border-amber-500 bg-amber-500/15 text-amber-200' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                    >
                      {appI18n.t("ui.RentingSyncModal.cash_payment")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcessMethod('advance')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${excessMethod === 'advance' ? 'border-amber-500 bg-amber-500/15 text-amber-200' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                    >
                      {appI18n.t("ui.RentingSyncModal.operating_advance")}
                    </button>
                  </div>
                  {excessMethod === 'advance' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">{appI18n.t("ui.RentingSyncModal.daily_installments_0_interest")}</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={advanceInstallments}
                          onChange={(e) => setAdvanceInstallments(Math.min(60, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="w-full bg-slate-950/40 border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">{appI18n.t("ui.RentingSyncModal.first_payment_date")}</label>
                        <input
                          type="date"
                          value={advanceStartDate}
                          onChange={(e) => setAdvanceStartDate(e.target.value)}
                          className="w-full bg-slate-950/40 border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition-all"
          >
            {appI18n.t("ui.RentingSyncModal.skip_for_now")}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || success || leasingLoading || leasingCheckError}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{appI18n.t("ui.RentingSyncModal.syncing_with_renting")}</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>{appI18n.t("ui.RentingSyncModal.confirm_and_create_expense")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
