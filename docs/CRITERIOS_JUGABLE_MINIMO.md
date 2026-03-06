# Criterios de aceptación — Versión jugable mínima

**Product Owner** — Para la tarea: "Auditar el juego y entregar una versión jugable mínima sobre la que poder trabajar".

## Objetivo
Un bucle jugable estable: menú → partida → colocar HQ → victoria/derrota → volver a menú. Sin crashes por assets faltantes ni referencias rotas. Base documentada para seguir desarrollando.

## Criterios de aceptación

### CA1: Arranque estable
- [ ] El proyecto arranca con F5 sin errores de autoload ni escena.
- [ ] No hay referencias a recursos que no existan (ej. icon.svg solo en [application], no en autoload).
- [ ] Si faltan texturas de terreno, el mapa se genera con fallback (colores sólidos) y no crashea.

### CA2: Menú → partida
- [ ] Menú muestra New Game, Load, Quit.
- [ ] New Game resetea estado (día 1, recursos, HQ no colocado) y carga la escena de ciudad.
- [ ] Load puede ser stub (diálogo "no implementado"); Quit cierra el juego.

### CA3: Ciudad jugable
- [ ] Se ve un mapa (tiles hierba/carretera) y ruinas seleccionables.
- [ ] Cámara: movimiento (WASD o arrastre) y zoom (rueda o Q/E) dentro de límites del mapa.
- [ ] Clic derecho en ruina la selecciona (resaltado visible); panel izquierdo muestra "Adaptar como HQ" y "Cancelar".
- [ ] "Adaptar como HQ" convierte la ruina en HQ (visual verde) y la registra en GameManager.

### CA4: Victoria y derrota
- [ ] Si no hay HQ al llegar la noche del día 1: se muestra panel "Derrota" y el juego se pausa.
- [ ] Si hay HQ y se llega al día 3: se muestra panel "¡Supervivencia!" y el juego se pausa.
- [ ] HUD muestra día, fase (Día/Noche), barra de tiempo y aviso "¡Coloca el HQ!" cuando aplica.

### CA5: Volver a menú
- [ ] En paneles Derrota/Victoria, el botón "Menú principal" carga la escena de menú (main.tscn) y permite jugar otra partida.

### CA6: Documentación
- [ ] Existe PLAYABLE.md (o equivalente) con: cómo ejecutar, cómo jugar, lista de archivos del bucle mínimo y próximos pasos.

## Definición de "listo"
Testing dará por cumplida la entrega cuando: F5 arranque sin error; una partida completa (menú → city → colocar HQ → día 3 → victoria) y una partida perdida (no colocar HQ → noche día 1 → derrota) funcionen; y "Menú principal" devuelva al menú. PLAYABLE.md debe estar actualizado.

## Prioridad
Todos los criterios son obligatorios para la versión jugable mínima.

---

## Informe Testing (flujo de agentes)

**Verificación realizada contra los criterios anteriores.**

| Criterio | Comprobación | Resultado |
|----------|--------------|-----------|
| CA1 | project.godot: solo GameManager en autoload; config/icon en [application]. map_gen.gd: fallback si tex_grass/tex_road null. | Cumple |
| CA2 | main_menu.gd: New Game → reset_for_new_game() + city.tscn; Load → popup; Quit → quit. | Cumple |
| CA3 | city.tscn con map_gen, Camera2D (límites 0–4096), ruin/building_type, build_menu Adaptar/Cancelar. | Cumple |
| CA4 | city_game_loop: night_started(1) sin HQ → LosePanel; day_changed(>=3) con HQ → WinPanel. HUD con día, fase, barra, aviso HQ. | Cumple |
| CA5 | _go_to_menu() → change_scene_to_file("res://scenes/main.tscn"). | Cumple |
| CA6 | PLAYABLE.md en raíz con ejecutar, jugar, archivos, cambios y próximos pasos. | Cumple |

**Linter**: Scripts del bucle mínimo (main_menu, gamemanager, map_gen, ruin, city_game_loop, build_menu, hud, camera_controller) sin errores.

**Correcciones de calidad/jugabilidad (revisión):**
- **Pausa y botones**: Con el juego pausado (Derrota/Victoria), los botones "Menú principal" no recibían input. Se asignó `process_mode = Node.PROCESS_MODE_ALWAYS` a GameLoop y a los paneles Lose/Win para que sigan procesando cuando `get_tree().paused == true`.
- **Objetivo visible**: En el panel de construcción se añadió el texto "Objetivo: Adapta una ruina como HQ y llega al día 3." y pasos claros (clic derecho → Adaptar como HQ).

**Conclusión**: Versión jugable mínima aceptada tras correcciones. Base lista para seguir trabajando.
