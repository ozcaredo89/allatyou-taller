CREATE TABLE public.taller_seguimiento_enlaces (
    ingreso_id uuid PRIMARY KEY REFERENCES public.taller_ingresos(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.taller_empresas(id) ON DELETE CASCADE,
    nonce uuid NOT NULL UNIQUE,
    vence_at timestamptz NOT NULL
);

CREATE TABLE public.taller_seguimiento_publicaciones (
    evento_id uuid PRIMARY KEY REFERENCES public.taller_ingresos_bitacora(id) ON DELETE CASCADE,
    ingreso_id uuid NOT NULL REFERENCES public.taller_ingresos(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.taller_empresas(id) ON DELETE CASCADE,
    mensaje text NOT NULL CHECK (char_length(mensaje) BETWEEN 1 AND 2000),
    fecha_entrega_estimada timestamptz,
    publicado_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.taller_seguimiento_publicaciones (empresa_id, ingreso_id, publicado_at DESC);
ALTER TABLE public.taller_seguimiento_enlaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taller_seguimiento_publicaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.taller_seguimiento_enlaces, public.taller_seguimiento_publicaciones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taller_seguimiento_enlaces, public.taller_seguimiento_publicaciones TO service_role;
