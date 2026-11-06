# Especificaciones Técnicas (Specs) — AllAtYou Taller

Directorio para especificaciones técnicas cuando se introducen nuevos subsistemas estructurales o el usuario lo solicite.

## Reglas Clave:
1. **Sin burocracia ni relleno:** Solo paths exactos, contratos API (body/response), DDL SQL y regla de aislamiento `.eq('empresa_id', req.empresa_id)`.
2. **Máximo 25-30 líneas:** Utilizar [`docs/specs/TEMPLATE.md`](./TEMPLATE.md).
3. **No requerida para cambios iterativos:** Mejoras de UI, fixes o peticiones puntuales del usuario se aplican directamente en código sin generar specs.
