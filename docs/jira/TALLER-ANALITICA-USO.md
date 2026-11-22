# TALLER-ANALITICA-USO — Medir adopción y tiempo activo por módulo

- **Tipo** Story · **Módulos** Frontend y PostHog · **Estado** Implementado localmente
- **Implementación** `e193de5` en `feature/analitica-uso`
- **Archivos** `frontend/src/utils/analytics.ts`, `frontend/src/utils/activeTime.ts`, `frontend/src/App.tsx`

## Objetivo

Medir qué módulos usan los talleres y cuánto tiempo activo pasan en ellos para priorizar mejoras.

## Criterios de aceptación

- [x] Registrar vistas por sección y acciones exitosas de ingreso, cotización y entrega.
- [x] Medir segundos con la pestaña visible y actividad en los últimos 60 segundos.
- [x] Asociar eventos a un ID interno de taller y excluir nombres, slugs y rutas completas.
- [x] Verificar TypeScript en frontend y backend y probar actividad, inactividad y visibilidad.
- [ ] Publicar la rama, abrir el PR y verificar la captura tras el despliegue.
- [ ] Configurar el tablero semanal en PostHog con talleres únicos, acciones y tiempo activo por módulo.
