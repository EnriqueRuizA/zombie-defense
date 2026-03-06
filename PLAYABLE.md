# Versión jugable mínima — Infection Free Zone Clone

Auditoría y base estable para seguir desarrollando. Criterios de aceptación y verificación: **docs/CRITERIOS_JUGABLE_MINIMO.md** (flujo de agentes: PO → Desarrollo → Testing).

---

## Cómo ejecutar

- **Godot 4.x** (4.3 o superior): abrir el proyecto, **F5** o "Reproducir".
- Escena principal: `scenes/main.tscn` (carga el menú).

---

## Cómo jugar (bucle mínimo)

1. **Menú**: "New Game" inicia partida (resetea día, recursos y HQ).
2. **Ciudad** (mapa 128×128 tiles, ~40 ruinas):
   - **Cámara**: WASD o flechas para mover, Q/E o rueda para zoom, **botón central** del ratón para arrastrar.
   - **Seleccionar ruina**: **clic derecho** sobre un edificio en ruinas (se marca en **cian**).
3. **Panel izquierdo (Construcción)**:
   - Con ruina seleccionada: **"Adaptar como HQ"** (la ruina pasa a **verde** = HQ).
   - **"Cancelar"** o clic derecho en vacío para deseleccionar.
4. **Objetivo**:
   - **Victoria**: tener el HQ colocado y llegar al **día 3** (~60 s en tiempo real).
   - **Derrota**: (a) llegar la **noche del día 1** sin haber colocado el HQ, o (b) que un **infectado** llegue al HQ durante la noche (asigna supervivientes a **Defender** para reducir la oleada).
5. **HUD**: Día, fase (Día/Noche), barra de tiempo, recursos, aviso "¡Coloca el HQ antes del anochecer!" si no hay HQ.
6. **Fin de partida**: panel "Derrota" o "¡Supervivencia!" y botón **"Menú principal"** (vuelve a `main.tscn`).

---

## Archivos de la versión jugable mínima

Solo estos forman el bucle jugable actual. El resto del repo (tower, zombie, proyectil, etc.) pertenece a otro prototipo y no se usa en esta versión.

| Ruta | Uso |
|------|-----|
| `project.godot` | Proyecto, autoload GameManager, input, ventana |
| `scenes/main.tscn` | Raíz: instancia el menú |
| `scenes/main_menu.tscn` | Menú (New Game / Load / Quit) |
| `scenes/city.tscn` | Mapa, cámara, HUD, menú construcción, GameLoop, paneles Win/Lose |
| `scenes/ruined_building.tscn` | Escena de una ruina (StaticBody2D + colisión + sprite) |
| `scripts/main_menu.gd` | Menú: beep, New Game (reset + city), Load (stub), Quit |
| `scripts/gamemanager.gd` | Autoload: recursos, día/hora, noche, HQ, edificios, señales, reset |
| `scripts/map_gen.gd` | Ciudad: TileMap (hierba/carretera), ruinas, selección clic derecho |
| `scripts/camera_controller.gd` | Cámara: límites, zoom, pan |
| `scripts/ruin.gd` | Ruina: highlight, selección, `adapt_to_hq()` |
| `scripts/city_game_loop.gd` | Victoria/derrota, día/noche (CanvasModulate), paneles, volver a menú |
| `ui/hud.tscn` + `ui/hud.gd` | HUD: día, Día/Noche, barra tiempo, 12 recursos, aviso HQ |
| `ui/build_menu.tscn` + `ui/build_menu.gd` | Panel construcción: Adaptar como HQ, Cancelar |
| **Fase 6** | |
| `scripts/survivor.gd` | Superviviente: datos (nombre, salud, trabajo) y dibujo en mapa (círculo verde) |
| `scenes/survivor.tscn` | Escena del superviviente |
| `ui/survivors_panel.tscn` + `ui/survivors_panel.gd` | Panel derecho: lista de supervivientes |
| GameManager | `survivors`, `hq_registered`, `add_survivor()`, `consume_survivor_rations()`, `get_defender_count()` |
| **Oleadas** | |
| `scenes/infected.tscn` | Escena del infectado (círculo rojo, avanza hacia HQ) |
| `scripts/infected.gd` | Movimiento hacia `target`, señal `reached_hq` al llegar |
| `scripts/city_game_loop.gd` | Spawn de oleada en `night_started` (2+día−defensores), derrota si llega al HQ, limpia al amanecer |

**Assets opcionales**: si existen `assets/Terrains/Grass Materials.png` y `Gravel Materials.png` se usan para el suelo; si no, se usan colores sólidos (verde/gris) y el juego sigue funcionando.

---

## Cambios aplicados en la auditoría

- **map_gen**: Si las texturas de terreno no cargan, se usan texturas de fallback (color sólido). Mapa reducido a **128×128** y **40 ruinas** para carga más rápida.
- **city.tscn**: Límites de cámara y posición inicial ajustados al mapa 128×128 (4096 px).
- **city_game_loop**: "Menú principal" carga `main.tscn`. **Crítico**: GameLoop y paneles Derrota/Victoria tienen `process_mode = PROCESS_MODE_ALWAYS` para que los botones respondan cuando el juego está pausado.
- **build_menu**: Objetivo visible ("Adapta una ruina como HQ y llega al día 3") e instrucciones paso a paso.
- **GameManager**: Sin cambios de lógica; `reset_for_new_game()` ya se llama desde el menú.

---

## Próximos pasos sugeridos

- Guardar/cargar partida (Load en menú).
- Más edificios y costes de recursos.
- **Oleadas nocturnas hechas**: cada noche aparecen infectados (2 + día − defensores); se mueven hacia el HQ; si uno llega, derrota; trabajo Defender reduce la oleada.
- **Fase 6 hecha**: Supervivientes al colocar HQ, panel derecho, consumo de raciones/día.
- **Trabajos hechos**: idle, Recolectar (recursos/día), Defender (neutraliza 1 infectado por noche).
- Sonido y feedback visual (efectos, partículas).

Este documento describe la **versión jugable mínima** sobre la que seguir trabajando.
