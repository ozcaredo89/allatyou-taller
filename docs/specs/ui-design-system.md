# Ficha — Estilo visual y componentes estándar

**Leer si:** la tarea crea o cambia una pantalla, un modal, un botón o una confirmación · **Actualizada:** 2026-11-16 · **Ticket:** `TALLER-UI-01`

## Archivos
- `frontend/src/components/ModalConfirmacion.tsx` — props `isOpen`, `onClose`, `onConfirm`, `title`, `description?`, `confirmText?`, `cancelText?`, `tipo?` (`danger | warning | info | success`), `loading?`, `icon?`, `children?`
- `frontend/src/index.css` (Tailwind v4); iconos de `lucide-react`

## Reglas
- **Confirmaciones:** en código nuevo usar `ModalConfirmacion`, nunca `window.confirm/alert/prompt`. `danger` para descartar o eliminar, `warning` para avisos (por ejemplo "No contactar más").
- **Acciones asíncronas:** el botón muestra `Loader2` girando y queda deshabilitado mientras corre.
- **Placas:** `font-mono font-black text-sm tracking-widest uppercase`, dentro de una insignia con borde.
- **El modal muestra a quién afecta:** cliente, placa o servicio en una tarjeta `bg-slate-50 border border-slate-100 rounded-2xl p-4`.

## Valores
| Uso | Clase |
|---|---|
| Fondo general / superficie / superficie secundaria | `bg-slate-100` / `bg-white` / `bg-slate-50` |
| Texto principal / secundario / ayuda | `text-slate-900` / `text-slate-500` / `text-xs text-slate-400` |
| Acción principal del sistema | `bg-indigo-600` |
| Peligro / precaución / éxito | `bg-red-600` / `bg-amber-600` / `bg-emerald-600` |
| WhatsApp | `bg-[#25D366]` |
| Botones y campos / tarjetas / modales | `rounded-xl` / `rounded-2xl shadow-sm border border-slate-200` / `rounded-3xl shadow-2xl border border-slate-100` |
| Título de página / de tarjeta o modal | `text-3xl font-bold text-slate-900 tracking-tight` / `text-lg font-bold text-slate-900 tracking-tight` |
| Capa de fondo del modal | `fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs` |

## Trampas / no tocar
- Todavía hay `window.confirm/alert` antiguos en `Checkout`, `Configuracion`, `CRM`, `Dashboard`, `Equipo`, `Gastos`, `NuevoIngreso` y `ReporteLiquidaciones`: no copiarlos; migrarlos solo si la tarea toca ese flujo.
- `ModalConfirmacion` cierra con `Escape` y clic afuera salvo mientras `loading`; no permitir cerrar durante la carga.
