import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Car, QrCode, CheckCircle2, ChevronRight, Loader2, MessageCircle, Wrench, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { generarLinkWhatsApp } from '../utils/whatsapp';
import api from '../services/api';

type Step = 'cargando' | 'placa' | 'datos' | 'motivo' | 'exito' | 'error';

interface Empresa {
  id: string;
  nombre: string;
  telefono_contacto: string;
  config_diagnostico?: Record<string, { visible: boolean; fallas_adicionales: string[] }>;
}

const MOTIVO_OMITIDO = 'Revisión pendiente por el encargado';

const Kiosco: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('cargando');
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Cliente / vehículo
  const [placa, setPlaca] = useState('');
  const [placaExiste, setPlacaExiste] = useState(false);
  const [nombreCliente, setNombreCliente] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [documento, setDocumento] = useState('');
  const [marca, setMarca] = useState('');
  const [linea, setLinea] = useState('');

  // Selección de servicios (chips)
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<string[]>([]);
  const [fallasSeleccionadas, setFallasSeleccionadas] = useState<Record<string, string[]>>({});
  const [detalleOtro, setDetalleOtro] = useState('');
  const [otroSeleccionado, setOtroSeleccionado] = useState(false);

  useEffect(() => {
    const cargarEmpresa = async () => {
      try {
        const { data } = await api.get(`/kiosco/${slug}`);
        setEmpresa(data);
        setStep('placa');
      } catch {
        setErrorMsg('No se pudo cargar la información del taller. Verifica el enlace.');
        setStep('error');
      }
    };
    cargarEmpresa();
  }, [slug]);

  const handleCheckPlaca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placa.trim() || !empresa) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const { data } = await api.post('/kiosco/check-placa', {
        placa: placa.toUpperCase(),
        empresa_id: empresa.id,
      });
      setPlacaExiste(data.existe);
      if (data.existe && data.nombre_cliente) {
        setNombreCliente(data.nombre_cliente);
      }
      setStep(data.existe ? 'motivo' : 'datos');
    } catch {
      setErrorMsg('Error verificando la placa. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const buildMotivo = (): string => {
    const motivosArray = serviciosSeleccionados.map(key => {
      const nombreCat = t(`diagnostico.sistemas.${key}`, { defaultValue: key.replace(/_/g, ' ') });
      const sub = fallasSeleccionadas[key];
      if (sub && sub.length > 0) return `${nombreCat} (${sub.join(', ')})`;
      return nombreCat;
    });
    if (otroSeleccionado && detalleOtro.trim()) motivosArray.push(`Nota: ${detalleOtro.trim()}`);
    return motivosArray.join(' | ');
  };

  const canSubmit = serviciosSeleccionados.length > 0 || (otroSeleccionado && detalleOtro.trim().length > 2);

  const handleRegistrar = async (motivoFinal?: string) => {
    if (!empresa) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      await api.post('/kiosco/registrar', {
        empresa_id: empresa.id,
        placa: placa.toUpperCase(),
        motivo_visita: motivoFinal ?? buildMotivo(),
        cliente: placaExiste ? undefined : { nombre_completo: nombre, telefono, documento },
        vehiculo: placaExiste ? undefined : { marca, linea },
      });
      setStep('exito');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Error al registrar. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleChip = (key: string) => {
    const estaActivo = serviciosSeleccionados.includes(key);
    setServiciosSeleccionados(prev =>
      estaActivo ? prev.filter(k => k !== key) : [...prev, key]
    );
    // Si se desmarca, limpiar sus sub-fallas
    if (estaActivo) {
      setFallasSeleccionadas(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const toggleSubFalla = (categoriaKey: string, falla: string) => {
    setFallasSeleccionadas(prev => {
      const actuales = prev[categoriaKey] || [];
      const yaEsta = actuales.includes(falla);
      return {
        ...prev,
        [categoriaKey]: yaEsta
          ? actuales.filter(f => f !== falla)
          : [...actuales, falla],
      };
    });
  };

  const resetAll = () => {
    setStep('placa'); setPlaca(''); setNombreCliente('');
    setNombre(''); setTelefono(''); setDocumento(''); setMarca(''); setLinea('');
    setServiciosSeleccionados([]); setFallasSeleccionadas({});
    setDetalleOtro(''); setOtroSeleccionado(false);
  };

  const whatsappLink = empresa?.telefono_contacto
    ? generarLinkWhatsApp(
        empresa.telefono_contacto,
        `Hola, acabo de registrar mi vehículo con placa ${placa.toUpperCase()} en el kiosco.`
      )
    : '';

  // Chips visibles de config_diagnostico (con config completa)
  const chipsVisibles: Array<{ key: string; fallas_adicionales: string[] }> = empresa?.config_diagnostico
    ? Object.entries(empresa.config_diagnostico)
        .filter(([, val]) => val.visible)
        .map(([key, val]) => ({ key, fallas_adicionales: val.fallas_adicionales || [] }))
    : [];

  // ─── PANTALLA: CARGANDO ──────────────────────────────────────────
  if (step === 'cargando') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
      </div>
    );
  }

  // ─── PANTALLA: ERROR ─────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Car size={36} className="text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Enlace no válido</h1>
          <p className="text-slate-500 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="text-center pt-10 pb-6 px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-900/50 mb-4">
          <Wrench size={30} className="text-white" />
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          {empresa?.nombre}
        </h1>
        <p className="text-indigo-300 text-sm mt-1">Auto-Registro de Vehículo</p>
      </div>

      {/* Card principal */}
      <div className="flex-1 flex items-start justify-center px-4 pb-10">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7 space-y-6">

          {/* ─── PASO 1: PLACA ─── */}
          {step === 'placa' && (
            <form onSubmit={handleCheckPlaca} className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-50 rounded-2xl mb-3">
                  <Car size={28} className="text-indigo-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">{t('kiosco.ingresa_placa')}</h2>
                <p className="text-slate-500 text-sm mt-1">Escribe la placa de tu vehículo para comenzar</p>
              </div>
              <input
                type="text"
                required
                maxLength={7}
                className="block w-full text-center text-4xl font-extrabold tracking-[0.3em] uppercase px-4 py-5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                placeholder="ABC123"
                value={placa}
                onChange={e => setPlaca(e.target.value.toUpperCase())}
              />
              {errorMsg && <p className="text-red-500 text-sm text-center font-medium">{errorMsg}</p>}
              <button
                type="submit"
                disabled={submitting || placa.trim().length < 5}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-lg transition disabled:opacity-50"
              >
                {submitting ? <Loader2 className="animate-spin" size={22} /> : <ChevronRight size={22} />}
                Siguiente
              </button>
            </form>
          )}

          {/* ─── PASO 2: DATOS DEL CLIENTE ─── */}
          {step === 'datos' && (
            <form onSubmit={(e) => { e.preventDefault(); setStep('motivo'); }} className="space-y-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-50 rounded-2xl mb-3">
                  <QrCode size={28} className="text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Primera vez aquí</h2>
                <p className="text-slate-500 text-sm mt-1">{t('kiosco.datos_cliente')}</p>
              </div>
              <div className="space-y-3">
                <input required type="text" placeholder="Nombre completo *" value={nombre} onChange={e => setNombre(e.target.value)}
                  className="block w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium" />
                <input required type="tel" placeholder="Teléfono *" value={telefono} onChange={e => setTelefono(e.target.value)}
                  className="block w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium" />
                <input type="text" placeholder="Documento (opcional)" value={documento} onChange={e => setDocumento(e.target.value)}
                  className="block w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium" />
                <div className="grid grid-cols-2 gap-3">
                  <input required type="text" placeholder="Marca *" value={marca} onChange={e => setMarca(e.target.value)}
                    className="block w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium" />
                  <input required type="text" placeholder="Línea / Modelo *" value={linea} onChange={e => setLinea(e.target.value)}
                    className="block w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium" />
                </div>
              </div>
              <button type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-lg transition"
              >
                <ChevronRight size={22} /> Continuar
              </button>
            </form>
          )}

          {/* ─── PASO 3: MOTIVO (CHIPS) ─── */}
          {step === 'motivo' && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-50 rounded-2xl mb-3">
                  <Car size={28} className="text-indigo-600" />
                </div>
                {nombreCliente ? (
                  <h2 className="text-xl font-bold text-slate-900">
                    {t('kiosco.hola_cliente', { nombre: nombreCliente.split(' ')[0] })}
                  </h2>
                ) : (
                  <h2 className="text-xl font-bold text-slate-900">{t('kiosco.motivo_visita')}</h2>
                )}
                <p className="text-slate-500 text-sm mt-1">
                  {t('kiosco.selecciona_servicio')} &nbsp;
                  <strong className="text-indigo-700 tracking-wider">{placa.toUpperCase()}</strong>
                </p>
              </div>

              {/* Chips grid */}
              {chipsVisibles.length > 0 ? (
                <div className="space-y-3">
                  {chipsVisibles.map(({ key, fallas_adicionales }) => {
                    const activo = serviciosSeleccionados.includes(key);
                    const subfallas = fallasSeleccionadas[key] || [];
                    return (
                      <div key={key} className="flex flex-col gap-2">
                        {/* Chip principal */}
                        <button
                          type="button"
                          onClick={() => toggleChip(key)}
                          className={`w-full text-left px-4 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
                            activo
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-400 hover:text-indigo-700'
                          }`}
                        >
                          {t(`diagnostico.sistemas.${key}`, { defaultValue: key.replace(/_/g, ' ') })}
                        </button>

                        {/* Sub-chips de fallas_adicionales */}
                        {activo && fallas_adicionales.length > 0 && (
                          <div className="ml-3 pl-3 border-l-2 border-indigo-200 flex flex-wrap gap-1.5">
                            {fallas_adicionales.map(falla => {
                              const subActiva = subfallas.includes(falla);
                              return (
                                <button
                                  key={falla}
                                  type="button"
                                  onClick={() => toggleSubFalla(key, falla)}
                                  className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all ${
                                    subActiva
                                      ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
                                      : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                                  }`}
                                >
                                  {falla}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Chip "Otra nota" */}
                  <button
                    type="button"
                    onClick={() => setOtroSeleccionado(prev => !prev)}
                    className={`w-full text-left px-4 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
                      otroSeleccionado
                        ? 'bg-amber-500 border-amber-500 text-white shadow-md'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-amber-400 hover:text-amber-700'
                    }`}
                  >
                    {t('kiosco.chip_otro')}
                  </button>
                </div>
              ) : (
                /* Fallback: textarea libre si no hay config */
                <textarea
                  rows={4}
                  placeholder="Describe el problema o servicio que necesitas..."
                  value={detalleOtro}
                  onChange={e => setDetalleOtro(e.target.value)}
                  className="block w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none font-medium leading-relaxed"
                />
              )}

              {/* Textarea si "Otra nota" está seleccionado */}
              {otroSeleccionado && chipsVisibles.length > 0 && (
                <textarea
                  rows={3}
                  autoFocus
                  placeholder="Describe el detalle adicional..."
                  value={detalleOtro}
                  onChange={e => setDetalleOtro(e.target.value)}
                  className="block w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl text-sm focus:ring-2 focus:ring-amber-400 outline-none resize-none font-medium leading-relaxed"
                />
              )}

              {errorMsg && <p className="text-red-500 text-sm text-center font-medium">{errorMsg}</p>}

              {/* Botón primario */}
              <button
                type="button"
                disabled={submitting || (!canSubmit && chipsVisibles.length > 0)}
                onClick={() => handleRegistrar()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition disabled:opacity-40"
              >
                {submitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                {t('kiosco.btn_completar')}
              </button>

              {/* Botón omitir */}
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleRegistrar(MOTIVO_OMITIDO)}
                className="w-full flex items-center justify-center gap-2 border-2 border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 font-semibold py-3.5 rounded-2xl text-sm transition disabled:opacity-50"
              >
                <SkipForward size={18} />
                {t('kiosco.btn_omitir')}
              </button>
            </div>
          )}

          {/* ─── PASO 4: ÉXITO ─── */}
          {step === 'exito' && (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 rounded-full">
                <CheckCircle2 size={44} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">{t('kiosco.exito_titulo')}</h2>
                <p className="text-slate-600 text-base mt-2 leading-relaxed">
                  Tu vehículo <strong className="text-indigo-700 tracking-wider">{placa.toUpperCase()}</strong> ha sido registrado.<br/>
                  <span className="text-sm text-slate-500 mt-1 block">{t('kiosco.exito_desc')}</span>
                </p>
              </div>
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl text-lg transition shadow-lg shadow-emerald-900/20"
                >
                  <MessageCircle size={24} /> Notificar por WhatsApp
                </a>
              )}
              <button
                onClick={resetAll}
                className="w-full border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 font-medium py-3.5 rounded-2xl text-sm transition"
              >
                Registrar otro vehículo
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Kiosco;
