import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface ContextoNota {
  tipo?: string;
  sistema?: string;
  vehiculo?: string;
}

interface NotaPorVozProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  contexto?: ContextoNota;
}

type Fase = 'idle' | 'escuchando' | 'mejorando';

interface UltimoDictado {
  antes: string;      // contenido de la nota antes de dictar
  original: string;   // lo que dijo el mecánico, tal cual
  mejorado: string;   // versión organizada por la IA
  usando: 'mejorado' | 'original';
}

const MAX_SEGUNDOS = 120;
const MAX_CHARS = 2000;

const getSpeechRecognition = (): any =>
  typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

const unir = (...partes: string[]) => partes.map(p => p.trim()).filter(Boolean).join(' ');
const componer = (antes: string, nuevo: string) => (antes.trim() ? `${antes.trim()}\n${nuevo}` : nuevo);

/**
 * Textarea con dictado por voz. Transcribe en el navegador (Web Speech API) y
 * envía el texto a /ai/pulir-nota para dejarlo ordenado y en tono profesional.
 * El mecánico siempre puede volver a lo que dijo textualmente.
 */
const NotaPorVoz: React.FC<NotaPorVozProps> = ({ value, onChange, placeholder, className = '', rows, contexto }) => {
  const { t, i18n } = useTranslation();
  const [soportado] = useState(() => !!getSpeechRecognition());
  const [fase, setFase] = useState<Fase>('idle');
  const [enVivo, setEnVivo] = useState('');
  const [aviso, setAviso] = useState('');
  const [ultimo, setUltimo] = useState<UltimoDictado | null>(null);

  const recRef = useRef<any>(null);
  const activoRef = useRef(false);
  const montadoRef = useRef(true);
  const acumuladoRef = useRef('');
  const sesionRef = useRef('');
  const silenciosRef = useRef(0);
  const antesRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  const contextoRef = useRef(contexto);
  onChangeRef.current = onChange;
  contextoRef.current = contexto;

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      activoRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      try { recRef.current?.abort(); } catch { /* noop */ }
    };
  }, []);

  const mejorar = async (dictado: string) => {
    const antes = antesRef.current;
    setFase('mejorando');
    try {
      const { data } = await api.post('/ai/pulir-nota', { texto: dictado, contexto: contextoRef.current });
      if (!montadoRef.current) return;
      if (data?.sin_contenido) {
        // No se inserta nada: el mecánico decide si igual quiere dejar lo dictado
        setUltimo({ antes, original: dictado, mejorado: '', usando: 'mejorado' });
        setAviso(t('voz.sin_contenido', 'No alcancé a entender una nota para la orden. Intenta de nuevo, sin afán.'));
      } else if (data?.pulido && data.texto) {
        onChangeRef.current(componer(antes, data.texto));
        setUltimo({ antes, original: dictado, mejorado: data.texto, usando: 'mejorado' });
      } else {
        onChangeRef.current(componer(antes, dictado));
        setAviso(t('voz.sin_mejora', 'Dejé tu dictado tal cual; ahora no pude organizarlo.'));
      }
    } catch {
      if (!montadoRef.current) return;
      onChangeRef.current(componer(antes, dictado));
      setAviso(t('voz.sin_mejora', 'Dejé tu dictado tal cual; ahora no pude organizarlo.'));
    } finally {
      if (montadoRef.current) setFase('idle');
    }
  };

  const finalizar = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    recRef.current = null;
    if (!montadoRef.current) return;
    const dictado = acumuladoRef.current.trim().slice(0, MAX_CHARS);
    setEnVivo('');
    if (!dictado) {
      setFase('idle');
      setAviso(prev => prev || t('voz.nada', 'No escuché nada. Toca el micrófono y habla cerca del celular.'));
      return;
    }
    void mejorar(dictado);
  };

  const iniciarSesion = () => {
    const SR = getSpeechRecognition();
    const rec = new SR();
    rec.lang = i18n.language?.startsWith('en') ? 'en-US' : 'es-CO';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    // Chrome Android duplica resultados en modo continuo: allí se usan sesiones cortas encadenadas
    rec.continuous = !/Android/i.test(navigator.userAgent);

    rec.onresult = (e: any) => {
      let finales = '';
      let parcial = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finales = unir(finales, r[0].transcript);
        else parcial = unir(parcial, r[0].transcript);
      }
      silenciosRef.current = 0;
      sesionRef.current = finales;
      const total = unir(acumuladoRef.current, finales, parcial);
      setEnVivo(total);
      if (total.length >= MAX_CHARS) detener();
    };

    rec.onerror = (e: any) => {
      if (e.error === 'no-speech') {
        silenciosRef.current += 1;
        if (silenciosRef.current >= 2) activoRef.current = false;
        return;
      }
      if (e.error === 'aborted') return;
      activoRef.current = false;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setAviso(t('voz.sin_permiso', 'Activa el permiso del micrófono en el navegador para dictar.'));
      } else if (e.error === 'audio-capture') {
        setAviso(t('voz.sin_microfono', 'No encontré un micrófono en este dispositivo.'));
      } else {
        setAviso(t('voz.error', 'Se cortó el dictado. Revisa tu conexión e intenta de nuevo.'));
      }
    };

    rec.onend = () => {
      acumuladoRef.current = unir(acumuladoRef.current, sesionRef.current);
      sesionRef.current = '';
      if (activoRef.current && montadoRef.current) {
        try { iniciarSesion(); return; } catch { activoRef.current = false; }
      }
      finalizar();
    };

    recRef.current = rec;
    rec.start();
  };

  const detener = () => {
    activoRef.current = false;
    try { recRef.current?.stop(); } catch { finalizar(); }
  };

  const empezar = () => {
    setAviso('');
    setUltimo(null);
    setEnVivo('');
    acumuladoRef.current = '';
    sesionRef.current = '';
    silenciosRef.current = 0;
    antesRef.current = value;
    activoRef.current = true;
    try {
      iniciarSesion();
      setFase('escuchando');
      timerRef.current = setTimeout(detener, MAX_SEGUNDOS * 1000);
    } catch {
      activoRef.current = false;
      setAviso(t('voz.error', 'Se cortó el dictado. Revisa tu conexión e intenta de nuevo.'));
    }
  };

  const alternarVersion = () => {
    if (!ultimo) return;
    const usando = ultimo.usando === 'mejorado' && ultimo.mejorado ? 'original' : ultimo.mejorado ? 'mejorado' : 'original';
    onChange(componer(ultimo.antes, usando === 'original' ? ultimo.original : ultimo.mejorado));
    setAviso('');
    setUltimo(ultimo.mejorado ? { ...ultimo, usando } : null);
  };

  const ocupado = fase !== 'idle';

  return (
    <div>
      <div className="relative">
        <textarea
          rows={rows}
          className={`${className} ${soportado ? 'pr-16' : ''}`}
          placeholder={placeholder}
          value={value}
          readOnly={ocupado}
          onChange={(e) => {
            setUltimo(null);
            setAviso('');
            onChange(e.target.value);
          }}
        />
        {soportado && (
          <button
            type="button"
            onClick={fase === 'escuchando' ? detener : empezar}
            disabled={fase === 'mejorando'}
            aria-label={fase === 'escuchando' ? t('voz.detener', 'Terminar dictado') : t('voz.dictar', 'Dictar nota por voz')}
            title={fase === 'escuchando' ? t('voz.detener', 'Terminar dictado') : t('voz.dictar', 'Dictar nota por voz')}
            className={`absolute bottom-3 right-2.5 h-12 w-12 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 disabled:opacity-70 ${
              fase === 'escuchando'
                ? 'bg-red-600 text-white ring-4 ring-red-200 animate-pulse'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {fase === 'escuchando' ? <Square size={18} fill="currentColor" /> : fase === 'mejorando' ? <Loader2 size={20} className="animate-spin" /> : <Mic size={22} />}
          </button>
        )}
      </div>

      <div aria-live="polite">
        {fase === 'escuchando' && (
          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-slate-700">
            <span className="font-semibold text-red-700">{t('voz.escuchando', 'Te escucho… toca el botón rojo al terminar.')}</span>
            {enVivo && <p className="mt-1 text-slate-600 italic">{enVivo}</p>}
          </div>
        )}

        {fase === 'mejorando' && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700">
            <Sparkles size={16} /> {t('voz.mejorando', 'Organizando tu nota…')}
          </div>
        )}

        {fase === 'idle' && aviso && (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{aviso}</p>
        )}

        {fase === 'idle' && ultimo && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            {ultimo.mejorado && (
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <Sparkles size={15} className="text-indigo-600" />
                {ultimo.usando === 'mejorado'
                  ? t('voz.lista', 'Nota organizada. Puedes editarla.')
                  : t('voz.usando_original', 'Usando lo que dijiste, tal cual.')}
              </span>
            )}
            <button
              type="button"
              onClick={alternarVersion}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              <RotateCcw size={14} />
              {ultimo.usando === 'mejorado'
                ? t('voz.usar_original', 'Usar lo que dije')
                : t('voz.usar_mejorada', 'Usar la versión organizada')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotaPorVoz;
