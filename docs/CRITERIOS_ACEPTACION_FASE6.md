# Criterios de aceptación — Fase 6: Supervivientes (mínimo)

**Product Owner** — Siguiente paso del flujo de desarrollo.

## Objetivo
Introducir supervivientes asociados al HQ: aparecen al colocar el HQ, se listan en un panel y consumen raciones cada día. Base para escuadras y trabajos posteriores.

## Criterios de aceptación

### CA1: Datos de supervivientes en GameManager
- [x] GameManager tiene `survivors` (array de dicts: name, health, job, node).
- [x] Al registrar el HQ se emite `hq_registered(pos)`; City spawnea 3 supervivientes y GM.add_survivor() para cada uno.

### CA2: Supervivientes visibles en el mapa
- [x] Al colocar el HQ, se instancian 3 nodos Survivor (círculo verde en _draw) cerca del HQ.
- [x] Permanecen en esa zona (sin pathfinding).

### CA3: Panel derecho "Supervivientes"
- [x] Panel derecho (SurvivorsPanel, ~260 px) con título "Supervivientes".
- [x] Lista con una línea por superviviente: nombre, HP 100, "Sin asignar".
- [x] Se actualiza en _process desde GameManager.survivors.

### CA4: Consumo de raciones
- [x] Al avanzar día (add_time → day += 1), se llama consume_survivor_rations(): deduce 1 food_rations por superviviente (hasta agotar existencias).

## Prioridad
- Crítico: CA1, CA2, CA3.
- Medio: CA4.

## Definición de "listo"
Tras colocar el HQ: se ven 3 figuras cerca del HQ, el panel derecho muestra 3 filas (nombre, salud, Sin asignar) y al pasar al día 2 las raciones bajan en 3 (o en el número de supervivientes).

---

## Informe Testing (Fase 6)

- **Linter**: Sin errores en gamemanager.gd, map_gen.gd, survivor.gd, survivors_panel.gd.
- **Pruebas manuales**: F5 → New Game → colocar HQ → comprobar 3 círculos verdes cerca del HQ y panel derecho con 3 filas; dejar pasar al día 2 → comprobar que food_rations baja en 3.
- **Resultado**: Cumple criterios. Fase 6 lista para siguiente fase.
