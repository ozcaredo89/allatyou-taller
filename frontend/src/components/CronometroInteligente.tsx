import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

interface Props {
  estadoDesde: string;
  promedioHistorico: number; // en minutos
}

const CronometroInteligente: React.FC<Props> = ({ estadoDesde, promedioHistorico }) => {
  const [segundosTotales, setSegundosTotales] = useState(0);

  useEffect(() => {
    const calcular = () => {
      const ahora = Date.now();
      const desde = new Date(estadoDesde).getTime();
      setSegundosTotales(Math.floor((ahora - desde) / 1000));
    };
    calcular();
    const interval = setInterval(calcular, 1000);
    return () => clearInterval(interval);
  }, [estadoDesde]);

  const formatearTiempo = (totalSeg: number): string => {
    if (totalSeg < 1) return '0s';
    const h = Math.floor(totalSeg / 3600);
    const m = Math.floor((totalSeg % 3600) / 60);
    const s = totalSeg % 60;

    const pad = (n: number) => String(n).padStart(2, '0');

    if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
    if (m > 0) return `${m}m ${pad(s)}s`;
    return `${s}s`;
  };

  const getColorClasses = (): string => {
    if (!promedioHistorico || promedioHistorico === 0) {
      return 'bg-red-100 text-red-700 border-red-200 animate-pulse';
    }

    const minutosTranscurridos = segundosTotales / 60;
    const porcentaje = (minutosTranscurridos / promedioHistorico) * 100;

    if (porcentaje < 50) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (porcentaje <= 100) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (porcentaje <= 150) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-red-100 text-red-700 border-red-200 animate-pulse';
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black tabular-nums border transition-colors shadow-sm ${getColorClasses()}`}>
      <Timer size={12} />
      <span>{formatearTiempo(segundosTotales)}</span>
    </div>
  );
};

export default CronometroInteligente;
