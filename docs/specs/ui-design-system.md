# Spec — Sistema de Diseño Visual y Estándar de UI (Design System)

**Estado:** Vigente · **Fecha:** 2026-11-06  
**Ticket JIRA:** `TALLER-UI-01`  
**Módulos afectados:**
- Frontend: `frontend/src/components/*`, `frontend/src/pages/*`, `frontend/src/index.css`

---

## 1. Contexto Operativo y Principios de Diseño

AllAtYou Taller es una plataforma SaaS de gestión operativa automotriz de alto rendimiento. Para garantizar una experiencia de usuario sólida, profesional y libre de interfaces toscas o anticuadas, esta especificación define las reglas visuales, tokens y componentes estándar obligatorios.

### Principios Fundamentales:
1. **Prohibición de Diálogos Nativos del Navegador:**
   - Queda estrictamente prohibido el uso de `window.confirm()`, `window.alert()` y `window.prompt()`. Bloquean el hilo principal de JavaScript, no transmiten identidad de marca y degradan la percepción de calidad del software.
   - Toda confirmación de acción destructiva, cambio de estado crítico o descarte debe utilizar modales estilizados con el estándar de la aplicación (`ModalConfirmacion.tsx`).
2. **Estética Automotriz Pro:**
   - Bordes redondeados modernos (`rounded-2xl` y `rounded-3xl`), microinteracciones fluidas, sombras de alta fidelidad (`shadow-xl`, `shadow-2xl`) y fondos de superposición con desenfoque (`backdrop-blur-xs` / `backdrop-blur-sm`).
3. **Placas Vehiculares Colombianas como Entidades de Primer Nivel:**
   - Las placas deben presentarse con tipografía monoespaciada de alta densidad (`font-mono font-black text-sm tracking-widest`), encerradas en pastillas o badges con borde marcado.
4. **Resiliencia & Estados de Carga:**
   - Ninguna acción asíncrona puede dejar al usuario en la incertidumbre. Todo botón en ejecución debe mostrar `Loader2` giratorio y deshabilitar interacciones concurrentes.

---

## 2. Tokens de Diseño (Design Tokens)

### 2.1. Paleta de Colores

| Token / Color | Hex / Clase Tailwind | Uso Principal |
|---|---|---|
| **Slate 950** | `#0a0f1c` | Fondos de alto contraste, modo nocturno sutil |
| **Euro Red** | `#da291c` | Identidad automotriz, acentos de marca |
| **Euro Dark** | `#111111` | Fondo de cabeceras oscuras, patrones hexagonales |
| **Fondo Base** | `#f3f4f6` (`bg-slate-100`) | Fondo global del workspace |
| **Superficie** | `#ffffff` (`bg-white`) | Tarjetas, modales y drawers |
| **Superficie Secundaria** | `#f8fafc` (`bg-slate-50`) | Cajas de previsualización, campos y detalles |
| **Texto Principal** | `#0f172a` (`text-slate-900`) | Títulos, identificadores y datos clave |
| **Texto Secundario** | `#64748b` (`text-slate-500`) | Etiquetas, descripciones y microcopia |
| **Destructivo / Peligro** | `#dc2626` (`bg-red-600`) | Descartar, eliminar, bajas irreversibles |
| **Alerta / Precaución** | `#d97706` (`bg-amber-600`) | Confirmaciones de advertencia, estados pendientes |
| **Éxito / Confirmación** | `#059669` (`bg-emerald-600`)| Órdenes entregadas, confirmados |
| **WhatsApp Oficial** | `#25D366` (`bg-[#25D366]`) | Enlaces y botones de contacto directo |
| **Acento CRM / Sistema** | `#4f46e5` (`bg-indigo-600`) | Botones de navegación, métricas activas |

### 2.2. Tipografía & Jerarquía

- **Fuente Base:** `Inter, system-ui, -apple-system, sans-serif`.
- **Títulos de Módulo (H1):** `text-3xl font-bold text-slate-900 tracking-tight`.
- **Títulos de Tarjetas / Modales (H2/H3):** `text-lg font-bold text-slate-900 tracking-tight`.
- **Placas de Vehículos:** `font-mono font-black text-sm tracking-widest uppercase`.
- **Microcopia / Ayuda:** `text-xs text-slate-400` o `text-[11px] text-slate-500`.

### 2.3. Radios y Elevaciones

- **Botones y Campos:** `rounded-xl` (12px).
- **Tarjetas de Contenido:** `rounded-2xl` (16px), `shadow-sm`, `border border-slate-200`.
- **Modales y Diálogos:** `rounded-3xl` (24px), `shadow-2xl`, `border border-slate-100`.

---

## 3. Estándar de Modales de Confirmación (`ModalConfirmacion`)

### 3.1. Arquitectura del Componente (`frontend/src/components/ModalConfirmacion.tsx`)

Todo diálogo de confirmación debe contar con:
1. **Overlay:** `fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs`.
2. **Contenedor:** `bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-fade-in-up`.
3. **Cierre:** Botón `X` superior derecho con soporte de tecla `Escape` y clic exterior (bloqueado durante `loading`).
4. **Header con Icono:** Contenedor de icono `w-12 h-12 rounded-2xl` con fondo semántico suave (`bg-red-50`, `bg-amber-50`, etc.).
5. **Cuerpo / Previsualización:** Tarjeta en `bg-slate-50 border border-slate-100 rounded-2xl p-4` que contextualiza la entidad afectada (nombre del cliente, placa del carro, servicio).
6. **Botonera de Acción:**
   - Botón Cancelar: `flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50`.
   - Botón Confirmar: `flex-1 py-2.5 px-4 rounded-xl font-bold text-white shadow-sm` con spinner `Loader2` cuando `loading === true`.

### 3.2. Contrato de Props

```typescript
export type ModalTipoConfirmacion = 'danger' | 'warning' | 'info' | 'success';

export interface ModalConfirmacionProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tipo?: ModalTipoConfirmacion;
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}
```

---

## 4. Patrones de Interfaz en CRM

### 4.1. Descarte de Reseñas de Google
- **Objetivo:** Permitir quitar una orden de la lista de reseñas pendientes sin penalizar ni desuscribir al cliente de la plataforma.
- **Acceso:** Icono de papelera `Trash2` en la cabecera de la tarjeta y botón *"Descartar"* en el pie de acciones.
- **Flujo de Confirmación:**
  1. El usuario pulsa *"Descartar"*.
  2. Se abre `ModalConfirmacion` con `tipo="danger"`, mostrando el resumen del cliente y la placa del vehículo.
  3. El usuario confirma.
  4. La tarjeta desaparece inmediatamente de la lista activa.
  5. Pasa a la sección colapsada *"Ver descartadas (N)"*, desde donde puede ser restaurada si fue un error.

### 4.2. Baja de Contacto (Ley 1581)
- **Objetivo:** Registrar formalmente el derecho de habeas data del cliente para no recibir mensajes comerciales de WhatsApp.
- **Acceso:** Enlace *"No contactar más"*.
- **Flujo de Confirmación:**
  1. Se abre `ModalConfirmacion` con `tipo="warning"` y el icono `BellOff`.
  2. Explica con claridad que el cliente no recibirá mensajes ni de reseñas ni de mantenimientos preventivos.

---

## 5. Criterios de Aceptación & Checklist de QA UI

- [x] **QA-01 (Sin Diálogos Nativos):** Ningún flujo en CRM invoca `window.confirm()` o `window.alert()`.
- [x] **QA-02 (Estética & Tipografía):** Modales cuentan con overlay `backdrop-blur`, esquinas `rounded-3xl` y jerarquía clara.
- [x] **QA-03 (Previsualización de Entidad):** Al descartar una reseña, el modal muestra el nombre del cliente y placa del vehículo.
- [x] **QA-04 (Accesibilidad y Teclado):** La tecla `Escape` cierra el modal siempre que no esté en estado de carga.
- [x] **QA-05 (Estados de Carga):** Mientras se ejecuta la llamada a la API, los botones se bloquean y muestran `Loader2`.
