# Ticket JIRA: TALLER-RENTING-ANTICIPO — Pagar un arreglo con anticipo operativo

**Estado:** Por hacer

```markdown
h2. 📌 Metadatos: TALLER-RENTING-ANTICIPO — Pagar arreglo con anticipo operativo
* *Tipo:* Story
* *Módulos:* Backend Taller / Frontend Taller / Backend Renting
* *Archivos:* `allatyou-renting-hub/src/routes/expenses.ts`, `backend/src/services/allatyouSync.service.ts`, `backend/src/controllers/ingresos.controller.ts` (`syncIngresoToRenting`), `frontend/src/components/RentingSyncModal.tsx`
* *Rama sugerida:* feature/TALLER-RENTING-ANTICIPO

---

h2. 🎯 Objetivo
Desde el modal del taller, permitir que el valor total del arreglo lo pague el conductor con un anticipo operativo con tasa, en cuotas diarias, sin depender del fondo de mantenimiento del leasing.

---

h2. 🧩 Contexto
* *Opcional, nunca por defecto:* la mayoría de los carros no están en leasing y sus arreglos son gastos del taller o de la flota. El modal crea un gasto simple por defecto; el anticipo solo se crea si el usuario marca "Cobrar al conductor con anticipo" y lo confirma.
* Renting ya tiene `POST /advances` (Basic Auth): `person_name`, `person_type: 'driver'`, `driver_id`, `plate`, `amount`, `rate_percent` (15 por defecto), `installments`, `start_date`, `daily_installment` (obligatoria). Valida la tasa (`advanceRateError`) y permite un solo anticipo activo por placa.
* Bug del fix anterior: cuando el fondo del leasing no alcanza y el excedente se cubre con anticipo, el taller no envía `leasing_advance_rate_percent` ni `leasing_advance_daily_installment`, así que el anticipo queda al 0%.

---

h2. 🛠️ Cambios
* [ ] **Taller service:** `crearAnticipoRenting()` que llama `POST /advances`. Orden: 1) crear el anticipo; 2) crear el gasto con `POST /expenses`; 3) si el gasto falla, `DELETE /advances/:id` (Renting no tiene DELETE de gastos). Guardar `renting_advance_id` en `taller_ingresos` (migración).
* [ ] **Conductor:** tomarlo de `/leasing/summary` si hay leasing. Sin leasing, definir de dónde sale en Renting (asignación del vehículo); si no hay conductor, bloquear la opción.
* [ ] **Taller backend:** `POST /api/ingresos/:id/renting-sync` acepta `payment_method: 'advance'` con `advance_rate_percent`, `advance_installments` y `advance_start_date`, y calcula `daily_installment` (redondeo a 100, igual que Renting) con la validación de tenant y flota que ya existe.
* [ ] **Taller modal:** opción "Cobrar al conductor con anticipo", excluyente con "Descontar del fondo de mantenimiento", con tasa (15% por defecto), número de cuotas, fecha de primer cobro y cuota diaria calculada.
* [ ] **Fix excedente leasing:** enviar `leasing_advance_rate_percent` y `leasing_advance_daily_installment` cuando el excedente se cubre con anticipo, con los mismos campos de tasa en el modal.

---

h2. ✅ Verificación
* [ ] Type-check de backend y frontend del taller, y de Renting.
* [ ] Arreglo con anticipo al 15%: se crean el gasto, el anticipo con esa tasa y el cronograma de N cuotas.
* [ ] Placa con un anticipo activo: Renting rechaza y no queda ningún gasto creado.
* [ ] Si el gasto falla después de crear el anticipo, el anticipo se elimina.
* [ ] Excedente de leasing con anticipo: el anticipo queda con la tasa elegida, no al 0%.
```
