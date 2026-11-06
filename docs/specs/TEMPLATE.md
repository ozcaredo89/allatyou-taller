# Spec — [Nombre del Módulo o Funcionalidad]

**Estado:** Vigente · **Fecha:** YYYY-MM-DD · **Ticket:** `TALLER-[NUM]`  
**Archivos:** `backend/src/...`, `frontend/src/...`, `docs/migrations/...`

---

## 1. Objetivo y Reglas
* **Problema y solución:** [1-2 líneas directas sobre qué resuelve]
* **Multi-tenant obligatorio:** Toda consulta backend filtra `.eq('empresa_id', req.empresa_id)` (fail-closed).

---

## 2. Base de Datos (si aplica)
```sql
ALTER TABLE [taller_tabla] ADD COLUMN IF NOT EXISTS [columna] [TIPO];
```

---

## 3. Contratos de API
* **`[METODO] /api/[ruta]`** (`requireAuth`)
  * **Body:** `{ "campo": "valor" }`
  * **Response (200):** `{ "success": true, "data": ... }`
  * **Errores:** 400 (inválido), 401/403 (no autorizado).

---

## 4. Frontend & Criterios
* **Componentes:** `frontend/src/pages/[Page].tsx`
* **Criterio de éxito:** [1-2 líneas con la validación clave]
