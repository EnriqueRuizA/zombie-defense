# Requisitos (Product Owner)

Documento vivo: el **PO** escribe aquí requisitos, criterios de aceptación y prioridad.  
**Dev** lo usa para implementar; **QA** para verificar.

---

## Visión del producto

- **Proyecto**: Infection Free Zone Clone (Godot 4.x, 2D top-down), evolucionando hacia **Zone Zero: Last Bastion** según el GDD.
- **Objetivo actual**: Base jugable de supervivencia: menú → ciudad → colocar HQ → supervivientes → defensa (muros, tropas) → oleadas de infectados → sobrevivir días (victoria/derrota) → volver a menú.
- **Plan a largo plazo**: Ver **`_agent-memory/PLAN_ZONE_ZERO.md`** (fases 1–13 alineadas con `ZONE_ZERO_GDD.md`). El backlog priorizado se alimenta de ese plan.
- **Ejecución**: **`_agent-memory/PLAN_EJECUCION_ZONE_ZERO.md`** define el protocolo de handoff (PO → Dev → QA → Director), DoD y desglose de ítems por fase. Los criterios de aceptación de cada ítem se escriben aquí o en `docs/` antes de implementar.

---

## Requisitos implementados (resumen)

- **R1** Menú principal: New Game (reset + cargar ciudad), Load (stub), Quit.
- **R2** Ciudad: mapa 128×128 (hierba/carretera), ruinas seleccionables con clic derecho.
- **R3** Construcción: panel izquierdo; adaptar ruina seleccionada como HQ (visual verde).
- **R4** Victoria: llegar al día 3 con HQ colocado. Derrota: noche del día 1 sin HQ.
- **R5** HUD: día, fase Día/Noche, barra de tiempo, 12 recursos, aviso "Coloca el HQ".
- **R6** Supervivientes: al colocar HQ aparecen 3 en el mapa (círculos verdes) y en panel derecho; consumen 1 ración/día por persona.
- **R7** Oleadas nocturnas: cada noche aparecen infectados que avanzan hacia el HQ; los supervivientes con trabajo "Defender" neutralizan uno cada uno; si un infectado llega al HQ, derrota; al amanecer desaparecen los que queden.

---

## Criterios de aceptación por fase / ítem

- Detalle en `docs/CRITERIOS_ACEPTACION_FASE5.md`, `CRITERIOS_JUGABLE_MINIMO.md`, `CRITERIOS_ACEPTACION_FASE6.md`.
- **Fase 1 (F1.x):** Criterios resumidos en PLAN_EJECUCION_ZONE_ZERO.md; el PO debe ampliarlos aquí o en `docs/` antes de que Dev implemente F1.2–F1.5.
- **Fase 3 (F3.x):** Idem para F3.1–F3.2 cuando se prioricen.

---

## Fuente de verdad del backlog

- Backlog priorizado: **`_agent-memory/backlog.md`** (el PO y el Director lo actualizan).

---

## Criterios de cierre del ciclo (producto terminado + calidad premium)

El flujo PO → Dev → QA **sigue en bucle** hasta que se cumplan **ambos**:

1. **Producto terminado**
   - Backlog de _agent-memory/backlog.md cerrado (todo "Hecho" o explícitamente descartado).
   - Todos los criterios de aceptación de las fases acordadas cumplidos (docs/).

2. **Calidad premium**
   - Cero bugs **CRÍTICOS** o **ALTOS** abiertos en _agent-memory/bug-reports.md.
   - QA ha verificado la última entrega y no hay regresiones conocidas.
   - Jugabilidad estable, sin crashes en el flujo principal (menú → partida → victoria/derrota → menú).

El **Director** comprueba estos criterios tras cada ronda de QA; si no se cumplen, asigna el siguiente paso (siguiente ítem del backlog o corrección de bugs).
