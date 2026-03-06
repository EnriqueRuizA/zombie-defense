# Flujo de agentes: Orquestador + Desarrollo, Testing, Product Owner

Este proyecto usa **4 roles** coordinados. El **Orquestador** dirige el flujo; **Desarrollo**, **Testing** y **Product Owner** son los tres agentes de trabajo.

## Roles

| Rol | Responsabilidad | No hace |
|-----|-----------------|--------|
| **Orquestador** | Coordinar tareas, validar entregas, decidir siguiente paso | Implementar código, escribir tests, definir requisitos de negocio |
| **Product Owner (PO)** | Requisitos, criterios de aceptación, prioridad | Código, tests, asignar tareas técnicas |
| **Desarrollo** | Implementar según criterios del PO | Definir requisitos, priorizar, validar aceptación |
| **Testing** | Verificar criterios, ejecutar tests, reportar incidencias | Implementar fixes, cambiar requisitos |

## Flujo típico

```
[PO] Define requisitos y criterios de aceptación
        ↓
[Orquestador] Asigna a Desarrollo: "Implementa X según criterios en Y"
        ↓
[Desarrollo] Implementa y entrega (archivos + resumen de comportamiento)
        ↓
[Orquestador] Pasa a Testing: "Verifica que se cumplan los criterios"
        ↓
[Testing] Ejecuta pruebas, revisa linter, reporta OK o incidencias
        ↓
[Orquestador] Decide:
   - Si OK → "Listo para siguiente fase" o siguiente ítem del backlog (el ciclo continúa)
   - Si incidencias → Devuelve a Desarrollo con el reporte
   - Si requisitos ambiguos → Pide aclaración al PO
   - El bucle solo termina cuando: producto terminado (backlog cerrado) y calidad premium (sin bugs críticos/altos, ver _agent-memory/requirements.md)
```

## Cómo usar en Cursor

1. **Activar un rol**  
   Di explícitamente con qué rol quieres que actúe el asistente, por ejemplo:
   - *"Actúa como orquestador: tenemos la tarea X lista, coordina verificación con Testing."*
   - *"Actúa como Product Owner: define criterios de aceptación para el menú de construcción."*
   - *"Actúa como Desarrollo: implementa el menú de construcción según AGENTS.md y los criterios del PO."*
   - *"Actúa como Testing: verifica que el HUD muestre los 12 recursos y que el día avance."*

2. **Reglas por rol**  
   En `.cursor/rules/` hay una regla por rol; Cursor las puede aplicar según el contexto:
   - `orchestrator.mdc` — Director (Orquestador)
   - `developer.mdc` — Desarrollo
   - `qa-engineer.mdc` — QA / Testing
   - `product-owner.mdc` — Product Owner

   Memoria compartida en `_agent-memory/`: `requirements.md` (PO), `architecture.md` (Dev), `bug-reports.md` (QA), `backlog.md` (priorizado).

3. **Orquestador en un solo turno**  
   Puedes pedir al Orquestador que, en un mismo mensaje, delegue y resuma:
   - *"Como orquestador: la Fase 4 está hecha. Asigna a Testing la verificación del HUD y día; si algo falla, devuélvelo a Desarrollo con el reporte."*

4. **Subagentes (mcp_task)**  
   Si usas tareas en segundo plano, el Orquestador puede lanzar:
   - **Desarrollo**: `mcp_task` con descripción tipo "Implementar menú de construcción según criterios del PO".
   - **Testing**: `mcp_task` con descripción tipo "Ejecutar tests y comprobar HUD y día en ciudad".
   - **Exploración**: para aclarar código o estructura antes de asignar a Desarrollo/Testing.

## Resumen rápido

- **Orquestador**: coordina y decide siguiente paso; el ciclo **sigue en bucle hasta producto terminado y calidad premium**.
- **PO**: qué se hace y cuándo está "listo" (criterios de aceptación y backlog).
- **Desarrollo**: hace el código.
- **Testing**: comprueba que se cumple lo acordado y reporta bugs.

Criterios de cierre del ciclo: ver sección "Criterios de cierre del ciclo" en `_agent-memory/requirements.md`.

Para establecer el flujo en una conversación, empieza por: *"Actúa como orquestador"* y describe la tarea o el estado actual del trabajo.
