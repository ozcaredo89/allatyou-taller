import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

interface Props {
  estadoDesde: string;
  promedioHistorico: number; // en minutos
  tiempoAcumuladoSeg?: number; // segundos de ciclos anteriores (rediagnóstico)
}

const CronometroInteligente: React.FC<Props> = ({ estadoDesde, promedioHistorico, tiempoAcumuladoSeg = 0 }) => {
  const [segundosTotales, setSegundosTotales] = useState(0);

  useEffect(() => {
    const calcular = () => {
      const ahora = Date.now();
      const desde = new Date(estadoDesde).getTime();
      const cicloActual = Math.floor((ahora - desde) / 1000);
      setSegundosTotales(tiempoAcumuladoSeg + cicloActual);
    };
    calcular();
    const interval = setInterval(calcular, 1000);
    return () => clearInterval(interval);
  }, [estadoDesde, tiempoAcumuladoSeg]);

  const formatearTiempo = (totalSeg: number): string => {
    if (totalSeg < 1) return '0s';
    
    const dias = Math.floor(totalSeg / 86400);
    const horas = Math.floor((totalSeg % 86400) / 3600);
    const minutos = Math.floor((totalSeg % 3600) / 60);
    const segundos = totalSeg % 60;

    const partes = [];
    if (dias > 0) partes.push(`${dias}d`);
    if (horas > 0 || dias > 0) partes.push(`${horas}h`); // Mostrar horas si hay días, aunque sean 0
    if (minutos > 0 || horas > 0 || dias > 0) partes.push(`${minutos}m`);
    partes.push(`${segundos}s`);

    return partes.join(' ');
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
