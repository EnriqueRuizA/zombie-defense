# Backlog (priorizado)

El **PO** y el **Director** mantienen aquí el backlog. **Dev** toma ítems por prioridad.

Formato: `[ ] Descripción (prioridad: CRÍTICA|ALTA|MEDIA|BAJA)`

---

## Por hacer

- [ ] Restaurar edificios "en suelo" al cargar partida (opcional) — BAJA

## Hecho (resumen)

- Fases 1–5: menú, mapa, cámara, HUD, construcción (Adaptar HQ), victoria/derrota, paneles en pausa.
- Versión jugable mínima (auditoría + correcciones).
- Fase 6: supervivientes al colocar HQ, panel derecho, consumo de raciones/día.
- Guardar/cargar: save_game() (recursos, día, HQ, supervivientes), apply_loaded_state(), Load en menú carga y va a ciudad; botón Guardar en HUD; guardado al ganar/perder.
- Base management: edificios con coste (HQ gratis 1, Almacén 25 madera+15 ladrillos max 5, Torre 20 madera+15 metal max 3); trabajos supervivientes (Sin asignar / Recolectar / Defender); Recolectar produce recursos al cambiar de día; panel derecho con selector de trabajo por fila.
- Oleadas nocturnas: al entrar la noche aparecen infectados (2 + día − defensores); se mueven hacia el HQ; si uno llega, derrota; los defensores (trabajo Defender) reducen la oleada; al amanecer se limpian.
- Bugfix: asignación de tareas a ciudadanos (panel ya no refrescaba cada frame y destruía el desplegable; ahora solo refresca al emitir GameManager.survivors_updated).
- Feedback visual: destello verde en recurso del HUD al ganar (recolectar/día); destello amarillo en "Día N" al cambiar de día.
- Sonido: SoundManager autoload; reproduce click.wav, build.wav, save.wav, day.wav desde assets/sfx/ si existen; llamadas en menú, construcción, guardado y cambio de día.
- Fantasma de colocación: botones "Almacén en suelo" y "Torre en suelo"; preview semitransparente sigue el ratón; clic izquierdo coloca (gasta recursos, comprueba solapamiento con ruinas); Escape o clic derecho cancela; escena placeable_building.tscn.
