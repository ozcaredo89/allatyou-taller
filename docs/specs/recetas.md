# Recetas — tareas repetidas sin explorar

**Leer si:** la tarea es una de estas. Seguir los pasos y abrir solo los archivos nombrados · **Actualizada:** 2026-11-16

## Endpoint nuevo con sesión
1. Función en `backend/src/controllers/<x>.controller.ts`: `export const nombre = async (req: Request, res: Response): Promise<void>`; validar el cuerpo, consultar con `.eq('empresa_id', req.empresa_id)`, responder `res.json(...)`; errores `res.status(4xx).json({ error })`.
2. Registrar en `backend/src/routes/<x>.routes.ts` con `requireAuth`. Las rutas fijas van **antes** de las que llevan `/:id`.
3. Un módulo nuevo además se monta en `backend/src/index.ts` (`app.use('/api/<x>', rutas)`).
4. En el frontend llamar con `api.get/post('/<x>/...')` desde `src/services/api.ts` (sin `/api` ni token a mano).

## Endpoint que llama a un modelo de IA
Copiar el patrón de `pulirNotaVoz` en `ai.controller.ts`; leer antes `ia.md`.
1. Tope de tamaño de entrada y límite por taller antes de cualquier consulta.
2. Leer `slug` y `config_ai` del taller y comprobar `hayPresupuestoIA`; sin presupuesto, responder un resultado degradado **sin** llamar al modelo.
3. Llamar a `routerIA({ systemPrompt, historial: [], ultimoMensaje, empresaSlug, ipHash: 'interno', omitirLog: true })`.
4. Si `resultado.proveedor === 'static_fallback'`, tratarlo como "IA no disponible".
5. El texto del usuario va delimitado y el prompt dice que es contenido, no instrucciones.

## Migración de base de datos
1. Archivo nuevo `docs/migrations/YYYYMMDD_descripcion.sql`, tablas con prefijo `taller_` y columna `empresa_id`.
2. Escribirla **repetible**: `IF NOT EXISTS`, `CREATE OR REPLACE`. Corre sola en Railway al desplegar (`backend/src/scripts/migrate.ts`), dentro de una transacción.
3. Se registra por **nombre de archivo** en `taller_schema_migrations`: nunca renombrar ni editar una migración ya aplicada; crear otra.
4. Corren en orden alfabético. Para probar una en local: `npm run db:migrate:dev -- <ruta>` dentro de `backend/` (requiere `DATABASE_URL`).

## Textos de pantalla
- `const { t } = useTranslation()` y `t('seccion.clave', 'Texto por defecto')`.
- Agregar la clave en `frontend/src/locales/es/translation.json` **y** en `en/translation.json`; español es el idioma por defecto y de respaldo.
- Dinero: `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })`.

## Campo de texto con dictado por voz
Reemplazar el `<textarea>` por `<NotaPorVoz value onChange={(texto) => …} className placeholder rows contexto={{ tipo, sistema?, vehiculo? }} />` (`frontend/src/components/NotaPorVoz.tsx`). `onChange` recibe el texto, no el evento. Ya está en `Diagnostico.tsx` y `ModalSeguimientoIngreso.tsx`.

## Subir fotos o archivos
`POST /api/upload` (campo `archivo`) o `/api/upload/multiple` (campo `archivos`, hasta 10) con `multipart/form-data` → `{ url }` o `{ urls }`. Ejemplo: `handleFileUpload` en `pages/Diagnostico.tsx`.

## Lógica duplicada que debe cambiarse en los dos lados
`utils/tipoItemUtils.ts` y `utils/dateUtils.ts` existen en `backend/src/` y en `frontend/src/`; un cambio en uno se replica en el otro.

## Reporte nuevo
Endpoint `GET /api/ingresos/reportes/<nombre>?start&end` + componente propio `components/Reporte<Nombre>.tsx` montado en una pestaña de `pages/Reportes.tsx`. Ver `reportes-operativos-y-seguimiento.md`.
