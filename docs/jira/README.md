# Sistema de Gestión de Tickets y Trazabilidad JIRA — AllAtYou Taller

Este directorio centraliza los formatos, plantillas y tickets de **JIRA** para el proyecto AllAtYou Taller. Su objetivo es garantizar trazabilidad completa entre requerimientos, commits de Git, especificaciones técnicas y despliegues a producción.

---

## 1. Convenciones de Trazabilidad

### Nomenclatura de Tickets
- **Clave del Proyecto:** `TALLER`
- **Formato de Ticket:** `TALLER-[NUMERO]` (Ej: `TALLER-101`, `TALLER-AUTH-02`)

### Nomenclatura de Ramas Git
- `feature/TALLER-[NUM]-[descripcion-corta]`
- `fix/TALLER-[NUM]-[descripcion-corta]`
- `chore/TALLER-[NUM]-[descripcion-corta]`

### Mensajes de Commit
Todo commit debe referenciar el ticket de JIRA:
```bash
git commit -m "[TALLER-102] feat(auth): add password recovery and reset flow"
```

### Relación 1:1 con Especificaciones Técnicas (Specs)
Toda funcionalidad no trivial que introduzca endpoints, migraciones o lógica de negocio debe tener:
1. Su ticket en JIRA (`docs/jira/TALLER-XXX.md`).
2. Su especificación técnica en `docs/specs/[funcionalidad].md` enlazando el ticket en la cabecera.

---

## 2. Archivos en este Directorio
- [`JIRA_ISSUE_TEMPLATE.md`](./JIRA_ISSUE_TEMPLATE.md): Plantilla estándar oficial lista para copiar y pegar en JIRA.
- [`TALLER-RECUPERAR-CONTRASENA.md`](./TALLER-RECUPERAR-CONTRASENA.md): Ticket generado para la funcionalidad de recuperación/creación de contraseñas.
