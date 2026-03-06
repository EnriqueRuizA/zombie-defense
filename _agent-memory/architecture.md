# Arquitectura (Developer)

El **Dev** mantiene este documento: estructura del código, convenciones y decisiones técnicas.  
Otros agentes lo leen para entender dónde implementar o probar.

---

## Stack

- **Motor**: Godot 4.x (4.3+)
- **Lenguaje**: GDScript
- **Tipo**: 2D top-down, vista isométrica (zoom.y = 0.5)

---

## Estructura de carpetas (código del juego)

```
scripts/          # Lógica: gamemanager.gd, map_gen.gd, ruin.gd, city_game_loop.gd, survivor.gd, ...
scenes/           # Escenas .tscn: main.tscn, main_menu.tscn, city.tscn, ruined_building.tscn, survivor.tscn
ui/               # UI: hud.tscn/.gd, build_menu.tscn/.gd, survivors_panel.tscn/.gd
assets/           # Sprites, sonidos, texturas (opcionales: fallbacks si faltan)
docs/             # Criterios de aceptación (PO), informes Testing
_agent-memory/    # Memoria compartida: requirements, architecture, bug-reports, backlog
```

- No existe carpeta `src/`: el código está en **scripts/**, **scenes/** y **ui/**.

---

## Puntos clave

- **GameManager** (autoload): recursos, día/hora, noche, edificios, supervivientes, `hq_position`, `get_defender_count()`, señales (`day_changed`, `night_started`, `hq_registered`, `survivors_updated`), `reset_for_new_game()`, `consume_survivor_rations()`, `apply_survivor_jobs()`, `set_survivor_job()`, `can_build()` / `count_buildings()`, `save_game()` / `load_game()` / `apply_loaded_state()`.
- **SoundManager** (autoload): `play_ui_click()`, `play_build()`, `play_save()`, `play_day_change()`; reproduce WAV desde `assets/sfx/` si existen.
- **map_gen** (ciudad): `start_placement(type)` inicia modo fantasma (almacen, tower, wall, troop); ghost sigue ratón; clic coloca, Escape/derecho cancela; `Placeables`, `Walls`, `Troops`; muros con wall.tscn (vida, grupo "wall"); tropas con troop.tscn (disparan a grupo "infected").
- **infected.gd**: vida (20 HP), `take_damage()`; comprueba muros en ruta y los daña; grupo "infected"; barra de vida al recibir daño.
- **wall.gd**: vida (40 HP), `take_damage()`, `get_rect_global()`, señal `destroyed`; grupo "wall".
- **troop.gd**: dispara al infectado más cercano en rango (140 px, 8 dmg/s); grupo "troop".
- **Escena principal**: `scenes/main.tscn` → instancia menú; New Game carga `scenes/city.tscn`.
- **Ciudad**: raíz con script `map_gen.gd`; nodos Ground (TileMap), Ruins, Survivors, Camera2D, HUD, BuildMenu, SurvivorsPanel, GameLoop (paneles Derrota/Victoria). GameLoop y paneles con `process_mode = PROCESS_MODE_ALWAYS` para que los botones respondan en pausa.
- **Convenciones**: nombres de dominio en español cuando ya existan; comentarios de fase (ej. "Fase 6") en scripts relevantes.

---

## Tests

- **QA** escribe tests y reportes en `_agent-memory/bug-reports.md`.
- No hay carpeta `tests/` con pytest (proyecto Godot); la verificación es manual y por criterios en `docs/`.
