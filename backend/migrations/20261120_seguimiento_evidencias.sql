CREATE TABLE public.taller_seguimiento_evidencias (
    id uuid PRIMARY KEY,
    evento_id uuid NOT NULL REFERENCES public.taller_ingresos_bitacora(id) ON DELETE CASCADE,
    ingreso_id uuid NOT NULL REFERENCES public.taller_ingresos(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.taller_empresas(id) ON DELETE CASCADE,
    posicion smallint NOT NULL CHECK (posicion BETWEEN 0 AND 3),
    tipo text NOT NULL CHECK (tipo IN ('image/jpeg', 'video/mp4')),
    contenido bytea NOT NULL CHECK (octet_length(contenido) BETWEEN 1 AND 4194304),
    UNIQUE (evento_id, posicion)
);
CREATE INDEX ON public.taller_seguimiento_evidencias (empresa_id, ingreso_id);
ALTER TABLE public.taller_seguimiento_evidencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.taller_seguimiento_evidencias FROM PUBLIC, anon, authenticated;
