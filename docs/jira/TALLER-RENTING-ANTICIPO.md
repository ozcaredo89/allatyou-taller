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
Desde el modal del taller, permitir que el valor total del arreglo lo pague el conductor con un anticipo operativo en cuotas diarias, sin depender del fondo de mantenimiento del leasing. Es un gasto: el anticipo va al 0% de interés.

---

h2. 🧩 Contexto
Hoy Renting solo crea un anticipo para el excedente que no cubre el fondo (`apply_to_leasing` + `leasing_excess_method: 'advance'`). No hay forma de financiar el arreglo completo con un anticipo.

---

h2. 🛠️ Cambios
* [ ] **Renting `POST /expenses`:** nuevo campo `payment_method: 'advance'` con `advance_installments` (1-60) y `advance_start_date`. Reutiliza el bloque actual de creación de anticipo + cronograma + rollback atómico, por el monto total del gasto y al 0%. Se extiende el endpoint actual en vez de crear uno nuevo para no duplicar la lógica transaccional.
* [ ] **Renting:** mantener la regla de un anticipo activo por placa (responder 400 con mensaje claro).
* [ ] **Renting:** definir el conductor responsable cuando la placa no tiene leasing (contrato activo o asignación del vehículo). Si no hay conductor, responder 400.
* [ ] **Taller backend:** validar y reenviar `payment_method`, `advance_installments` y `advance_start_date` en `POST /api/ingresos/:id/renting-sync` (con la validación de tenant y flota que ya existe).
* [ ] **Taller modal:** opción "Cobrar al conductor con anticipo", excluyente con "Descontar del fondo de mantenimiento", con el número de cuotas, la fecha de primer cobro y el valor de la cuota diaria calculado.

---

h2. ✅ Verificación
* [ ] Type-check de backend y frontend del taller, y de Renting.
* [ ] Placa sin leasing: se crean el gasto, el anticipo y el cronograma de N cuotas que suman el total.
* [ ] Placa con un anticipo activo: Renting rechaza y no queda ningún gasto creado.
```
