# Ticket JIRA: TALLER-ITEMS-TIPO-MAL-CLASIFICADO — Corregir mano de obra registrada como repuesto

**Estado:** Backlog

```markdown
h2. 📌 Metadatos: TALLER-ITEMS-TIPO-MAL-CLASIFICADO — Corregir ítems históricos con tipo incorrecto
* *Tipo:* Bug (datos)
* *Módulos:* Database / Backend
* *Archivos:* `backend/src/utils/tipoItemUtils.ts` (heurística `pareceManoObra`), `taller_ingresos.items_factura` (JSONB), `taller_gastos.item_id`, `backend/src/controllers/liquidaciones.controller.ts`
* *Rama sugerida:* fix/TALLER-ITEMS-TIPO-MAL-CLASIFICADO

---

h2. 🎯 Objetivo
Reclasificar como `mano_obra` los ítems de `items_factura` guardados como `repuesto` que en realidad son servicios (el checkout arrancaba por defecto en Repuesto). Ensucian el reporte de repuestos, la separación MO/repuestos del reporte financiero y las comisiones de técnicos.

---

h2. 🧩 Contexto
* Prevención ya en producción: aviso + confirmación en Checkout y badge "¿Mano de obra?" en el reporte de repuestos (misma heurística).
* Las comisiones se calculan solo con `tipo === 'mano_obra'` → los ítems mal clasificados probablemente no se liquidaron.
* `taller_gastos.item_id` exige que el ítem sea repuesto: revisar costos vinculados antes de reclasificar.

---

h2. 🛠️ Pasos
* [ ] Script de solo lectura: listar sospechosos por empresa (orden, placa, fecha entrega, descripción, total, gasto vinculado sí/no).
* [ ] Revisión manual del listado con el taller (descartar falsos positivos).
* [ ] Script de corrección sobre la lista aprobada (filtrado por `empresa_id`, con respaldo previo del JSONB).
* [ ] Decidir si se recalculan comisiones/liquidaciones de órdenes ya entregadas y periodos cerrados.

---

h2. ✅ Verificación
* [ ] Reporte de repuestos sin badges "¿Mano de obra?" en el período corregido.
* [ ] Totales MO/repuestos del reporte financiero cuadran con lo esperado.
```
