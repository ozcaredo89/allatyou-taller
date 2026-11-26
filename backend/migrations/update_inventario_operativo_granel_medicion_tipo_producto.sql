ALTER TABLE public.taller_inventario_items
  ADD COLUMN tipo_producto text NOT NULL DEFAULT 'repuesto' CHECK (tipo_producto IN ('repuesto','aceite')),
  ADD COLUMN viscosidad text CHECK (viscosidad ~ '^([0-9]{1,2}W-[0-9]{2}|SAE [0-9]{1,2})$'),
  ADD COLUMN base_aceite text CHECK (base_aceite IN ('mineral','semisintetico','sintetico')),
  ADD COLUMN marca text,
  ADD COLUMN especificacion text,
  ADD COLUMN contenido_litros numeric(12,3);

UPDATE public.taller_inventario_items SET tipo_producto='aceite' WHERE es_granel;

ALTER TABLE public.taller_inventario_items ADD CONSTRAINT inventario_presentacion_aceite CHECK (
  (tipo_producto = 'repuesto' AND NOT es_granel AND viscosidad IS NULL AND base_aceite IS NULL
    AND marca IS NULL AND especificacion IS NULL AND contenido_litros IS NULL)
  OR (tipo_producto = 'aceite' AND (
    (es_granel AND unidad='litro' AND contenido_litros IS NULL)
    OR (NOT es_granel AND unidad='und' AND contenido_litros IS NOT NULL
        AND contenido_litros > 0 AND contenido_litros < 'Infinity'::numeric)
  ))
);
GRANT INSERT (tipo_producto, viscosidad, base_aceite, marca, especificacion, contenido_litros),
      UPDATE (tipo_producto, viscosidad, base_aceite, marca, especificacion, contenido_litros)
  ON public.taller_inventario_items TO service_role;
