import React, { useState } from 'react';
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
  FileText 
} from 'lucide-react';
import api from '../services/api';

export interface RentingSyncItem {
  item: string;
  category?: string;
  amount: number;
}

interface RentingSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  ingresoId: string;
  placa: string;
  initialDate?: string;
  initialDescription?: string;
  initialItems: RentingSyncItem[];
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
  onSuccess
}) => {
  if (!isOpen) return null;

  const defaultDate = initialDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

  const [date, setDate] = useState<string>(defaultDate);
  const [description, setDescription] = useState<string>(initialDescription || `Reparación Taller [${placa}]`);
  const [items, setItems] = useState<RentingSyncItem[]>(
    initialItems.length > 0 ? initialItems : [{ item: 'Mano de Obra / Reparación', category: 'Mantenimiento', amount: 0 }]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      setError('Debes conservar al menos un ítem');
      return;
    }
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
  };

  const totalAmount = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validaciones
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Selecciona una fecha válida (YYYY-MM-DD)');
      return;
    }

    if (!description.trim()) {
      setError('Ingresa una descripción del gasto');
      return;
    }

    if (items.length === 0) {
      setError('Debes incluir al menos un ítem');
      return;
    }

    for (const it of items) {
      if (!it.item.trim()) {
        setError('Todos los ítems deben tener una descripción');
        return;
      }
      if (typeof it.amount !== 'number' || isNaN(it.amount) || it.amount <= 0) {
        setError(`El ítem "${it.item || 'sin nombre'}" debe tener un valor mayor a cero`);
        return;
      }
    }

    setLoading(true);

    try {
      await api.post(`/ingresos/${ingresoId}/renting-sync`, {
        date,
        description: description.trim(),
        items: items.map(it => ({
          item: it.item.trim(),
          category: it.category || 'Mantenimiento',
          amount: Number(it.amount)
        }))
      });

      setSuccess(true);
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
              <h3 className="font-semibold text-lg text-white">Registrar Gasto en Flota AllAtYou</h3>
              <p className="text-xs text-slate-400">Verifica los repuestos y mano de obra antes de sincronizar</p>
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
              <span>¡Gasto creado exitosamente en AllAtYou Renting Hub!</span>
            </div>
          )}

          {/* Fila: Placa y Fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Placa (Solo Lectura) */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5" />
                Placa del Vehículo
                <span className="text-slate-500 text-[10px] flex items-center gap-0.5 ml-auto">
                  <Lock className="w-3 h-3" /> Inmutable
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
                Fecha del Gasto (Zona Horaria Bogotá)
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

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Descripción General
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Mantenimiento frenos orden #..."
              required
              className="w-full bg-slate-950/40 border border-slate-700/70 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white transition-all outline-hidden"
            />
          </div>

          {/* Tabla de Ítems */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Detalle de Repuestos y Mano de Obra
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 py-1 px-2.5 rounded-lg hover:bg-amber-400/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar Ítem
              </button>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/30">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-3.5 py-2.5">Concepto / Repuesto</th>
                    <th className="px-3.5 py-2.5 w-36 text-right">Valor ($ COP)</th>
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
                          placeholder="Descripción del ítem"
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
                          title="Eliminar ítem"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-950/80 border-t border-slate-800">
                  <tr>
                    <td className="px-3.5 py-2.5 font-medium text-slate-300">Total a Sincronizar:</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-sm text-emerald-400">
                      ${totalAmount.toLocaleString('es-CO')}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition-all"
          >
            Omitir por ahora
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || success}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sincronizando con Renting...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Confirmar y Crear Gasto</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
