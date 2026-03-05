# Prompt: Calidad premium para Zombie Defense (nivel 50€ Steam)

Análisis como jugador extremadamente quisquilloso y especificación de cambios para que el juego 2D justifique un precio premium en Steam, con optimizaciones de rendimiento, coherencia de código y cero errores de compilación.

---

## 1. ANÁLISIS CRÍTICO (jugador quisquilloso)

### 1.1 Primera impresión y menús
- **Problema**: No hay menú principal; se entra directo a la partida. Un juego de pago debe tener pantalla de título, opciones (audio, controles, idioma) y posiblemente selección de nivel o dificultad.
- **Problema**: El menú de compra es funcional pero feo: botones planos, sin iconos de torre, sin descripción de estadísticas (rango, daño, cadencia) en el tooltip o panel.
- **Problema**: Game Over solo muestra "¡Has perdido!" y un botón Reiniciar. No hay puntuación final, oleada alcanzada, estadísticas ni opción de volver al menú principal.

### 1.2 Jugabilidad y feedback
- **Problema**: No hay condición de victoria; la señal `juego_ganado` existe pero nunca se emite. El jugador no sabe si "ganar" es sobrevivir X oleadas o infinitas.
- **Problema**: Al completar una oleada no hay feedback claro: ni mensaje, ni sonido, ni recompensa extra. El botón "Iniciar oleada" se habilita pero sin celebrar.
- **Problema**: Al colocar una torre no se muestra el rango de disparo; el jugador no ve hasta dónde llega antes de soltar.
- **Problema**: No hay indicador de vida de los zombies (barra de vida encima o al pasar el ratón).
- **Problema**: Sin sonido: ni disparos, ni impacto, ni zombies, ni música, ni UI. Un juego de pago sin audio se siente incompleto.
- **Problema**: No hay partículas ni efectos al matar zombie (sangre, explosión ligera, número de daño flotante).
- **Problema**: La cámara no tiene suavizado (smoothing); los movimientos se sienten bruscos.

### 1.3 Balance y progresión
- **Problema**: Fórmula de oleadas y dificultad (vida/velocidad) está fija en código; no hay curva de dificultad documentada ni ajustable desde proyecto/balance.
- **Problema**: `tiempo_entre_oleadas` está exportado en Main pero no se usa; el intervalo entre zombies lo define la UI con un valor fijo. Confuso y sin uso de la variable.
- **Problema**: No hay variedad de enemigos (tipos de zombie con comportamientos distintos) ni mejoras de torres (niveles, ventajas).

### 1.4 Pulido técnico y UX
- **Problema**: Constantes "mágicas" repartidas (99999, 999, 2.0, 12.0, 0.15, 0.06, etc.) sin nombre semántico; dificulta balance y lectura.
- **Problema**: Dependencia de que el padre de la UI sea exactamente el nodo Main; si se reestructura la escena, la UI deja de funcionar.
- **Problema**: Las torres obtienen el contenedor de proyectiles con `get_tree().current_scene.get_node_or_null("Mundo/Proyectiles")`; si cambia la escena actual (por ejemplo otro nivel), falla.
- **Problema**: Cada torre llama a `get_tree().get_nodes_in_group("zombies")` cada frame; con muchas torres es costoso y redundante.
- **Problema**: Al colocar torre se hace `add_child` y luego `aplicar_tipo` y `colocar`; la torre ya ejecutó `_ready` con datos por defecto y puede verse un parpadeo o estado incoherente.
- **Problema**: El proyectil puede llamar a `recibir_daño` en un objetivo que otro proyectil acaba de eliminar en el mismo frame (riesgo de llamada a nodo liberado).
- **Problema**: Código muerto: `registrar_torre()` en Main no se usa; las torres se añaden directamente al contenedor.

### 1.5 Accesibilidad y controles
- **Problema**: Sin atajos de teclado documentados para "Comprar torres" o "Iniciar oleada".
- **Problema**: Sin opciones de accesibilidad (tamaño de fuente, contraste, subtítulos si hubiera audio).

### 1.6 Arte y presentación
- **Problema**: Sprites por defecto (recruit, soldier, sniper, zombie) sin animación; todo estático.
- **Problema**: Un solo camino recto; el nivel se siente vacío. Para un juego de pago se esperan varios niveles o al menos variación visual (decoración, obstáculos, tema).
- **Problema**: Sin transiciones entre pantallas (fade in/out).

---

## 2. ESPECIFICACIÓN DE CAMBIOS (para calidad premium)

### 2.1 Menús y flujo
- Añadir **menú principal**: título, "Jugar", "Opciones", "Salir". Escena `main_menu.tscn` como punto de entrada o segunda escena a la que se vuelve desde Game Over.
- En **Opciones**: volumen maestro, música, SFX; controles (teclado); posible selector de idioma si se añaden traducciones.
- **Game Over**: mostrar texto "Oleada alcanzada: X", "Zombies eliminados: Y", "Puntuación: Z" (si se implementa puntuación); botones "Reintentar" y "Menú principal".

### 2.2 Condición de victoria y oleadas
- Definir **condición de victoria** (ej.: "Superar oleada 10" o "Eliminar a un jefe final") y emitir `juego_ganado` cuando se cumpla; pantalla de victoria con estadísticas y "Menú principal" / "Siguiente nivel".
- Al terminar una oleada: **feedback visual y/o sonoro** (mensaje "Oleada X completada", sonido, posible bonus de oro), y usar `tiempo_entre_oleadas` para un retraso antes de poder iniciar la siguiente (o documentar que es "pausa entre oleadas" y conectarlo a la UI).

### 2.3 Feedback de jugabilidad
- **Rango de torre al colocar**: dibujar un círculo o arco (por ejemplo con Line2D o un sprite de círculo semitransparente) mientras el cursor está en modo colocar, centrado en la posición del cursor.
- **Vida de zombies**: barra de vida encima de cada zombie (ProgressBar o TextureProgressBar en el nodo zombie), actualizada en `recibir_daño`.
- **Efectos**: partículas o sprite animado al morir zombie; opcional número de daño flotante (Label que sube y se desvanece).
- **Audio**: al menos SFX para disparo, impacto en zombie, zombie muerto, oleada completada, game over, clic UI; música de fondo en menú y en partida (con opción de silenciar en Opciones).

### 2.4 Cámara
- Activar **smoothing** en Camera2D (enabled = true) y ajustar `position_smoothing_speed` para un seguimiento suave si se desea seguir al jugador, o mantener pan manual con suavizado en el movimiento (lerp de posición).

### 2.5 Balance y datos
- Sacar **constantes de balance** a un recurso o autoload (ej. `Balance.gd` o `balance.tres`): oro inicial, vida por oleada, velocidad por oleada, zombies por oleada, costes y stats de torres. Así se ajusta sin tocar código.
- Usar o eliminar `tiempo_entre_oleadas`: si es "pausa entre oleadas", la UI debe esperar ese tiempo tras `oleada_terminada` antes de habilitar "Iniciar oleada"; si no se usa, quitarlo del export para no confundir.

### 2.6 Optimizaciones de rendimiento
- **Cache de zombies**: un único punto (Main o un "ZombieManager") que cada frame actualice una lista de zombies vivos (por ejemplo hijos de `Mundo/Zombies` con `is_instance_valid`). Las torres piden esa lista a Main (por grupo "game_manager" o referencia inyectada) en lugar de llamar a `get_nodes_in_group("zombies")` cada una.
- **Referencia al game manager**: Main se añade a un grupo `"game_manager"`. Torres y otros sistemas obtienen el nodo con `get_tree().get_first_node_in_group("game_manager")` y usan `get_contenedor_proyectiles()` / `get_zombies_vivos()` en lugar de asumir `current_scene` y rutas fijas.
- **Pool de proyectiles** (opcional): reutilizar proyectiles desactivados en lugar de instanciar/liberar constantemente; reduce asignaciones en oleadas grandes.

### 2.7 Coherencia de código y cero errores de compilación
- **Orden de colocación de torre**: instanciar torre, asignar `position`, llamar `aplicar_tipo(info)`, luego `add_child(torre)`. Así en `_ready` de la torre el sprite ya tiene tipo aplicado; llamar `colocar()` solo desde `_ready` (una vez) y no duplicar desde Main.
- **Proyectil**: comprobar `is_instance_valid(objetivo)` inmediatamente antes de `objetivo.recibir_daño(daño)` y no llamar si ya no es válido.
- **Constantes con nombre**: sustituir números mágicos por constantes (ej. `ORO_MAX`, `VIDAS_MAX`, `PASO_DISTANCIA_PATH`, `DISTANCIA_IMPACTO_PROYECTIL`, `FACTOR_VIDA_OLEADA`, `FACTOR_VELOCIDAD_OLEADA`, `VIDA_BASE_ZOMBIE`, `VELOCIDAD_BASE_ZOMBIE`, `RECT_SUELO`, etc.).
- **Eliminar código muerto**: quitar `registrar_torre()` si no se usa, o usarlo como único punto de reparentado de torres.
- **Tipado fuerte**: usar `class_name Main` en `main.gd` y en la UI declarar `var main: Main` (asignado en `_ready` desde `get_parent()` o desde grupo) para evitar errores en tiempo de edición y mejor autocompletado.
- **UI y Main**: no depender del padre directo como única forma de obtener Main; preferible obtener por grupo `"game_manager"` para que funcione aunque la UI esté en otro nivel del árbol.

### 2.8 Escenas y recursos
- Comprobar que todas las rutas `res://` en preload/load existen (tower, zombie, proyectil, texturas, assets).
- Documentar en comentarios los nombres de nodos que el código asume (ej. `Mundo/Proyectiles`, `Panel/HBox/OroLabel`) para evitar roturas al reorganizar escenas.

### 2.9 Pruebas y compilación
- Ejecutar el proyecto en Godot y comprobar que no hay errores en consola (null reference, grupo vacío, nodo no encontrado).
- Revisar que no queden referencias a nodos eliminados ni señales conectadas a nodos liberados (desconectar en `tree_exited` o usar `Callable` con comprobación).

---

## 3. CHECKLIST DE IMPLEMENTACIÓN

- [x] Menú principal (título, Jugar, Opciones, Salir).
- [x] Opciones: volumen (guardado en user://config.cfg).
- [x] Game Over con estadísticas (oleada, zombies eliminados) y Menú principal.
- [x] Condición de victoria (oleada 10) y pantalla de victoria.
- [x] Feedback al completar oleada (mensaje "Oleada X completada!", uso de `tiempo_entre_oleadas`).
- [x] Indicador de rango al colocar torre (círculo amarillo siguiendo el ratón).
- [x] Barras de vida en zombies.
- [x] Efectos al matar zombie (círculo que se expande y desvanece).
- [x] Audio: AudioManager autoload; opciones de volumen en menú.
- [x] Cámara con smoothing (position_smoothing_enabled, speed 8).
- [x] Constantes de balance en autoload Balance.gd.
- [x] Cache de zombies en Main y torres usando `get_zombies_vivos()`.
- [x] Main en grupo "game_manager"; torres obtienen contenedor de proyectiles desde Main.
- [x] Orden de colocación: aplicar_tipo antes de add_child; colocar solo en _ready.
- [x] Proyectil: comprobar is_instance_valid justo antes de recibir_daño.
- [x] Constantes con nombre para todos los números mágicos.
- [x] Eliminar o usar registrar_torre; tipado Main y UI por grupo.
- [ ] Revisión final de lints y ejecución sin errores (pendiente ejecutar en Godot).

---

## 4. RESUMEN EJECUTIVO

Para que el juego justifique 50€ en Steam como 2D premium:

1. **Contenido**: menú principal, opciones, varias oleadas con curva de dificultad clara, condición de victoria, posiblemente varios niveles o modos.
2. **Pulido**: audio completo, feedback visual (rangos, vidas, efectos), cámara suave, transiciones.
3. **Código**: sin código muerto, constantes nombradas, referencias por grupo, cache de zombies, orden de inicialización correcto y comprobaciones de validez de nodos para evitar crashes.
4. **Rendimiento**: una sola fuente de verdad para la lista de zombies y uso de grupo para el game manager, con opción de pool de proyectiles en partidas muy largas.

Este documento sirve como prompt para implementar los cambios por fases: primero coherencia y optimizaciones (ya aplicables en el código actual), luego menús y condición de victoria, y por último audio, efectos y balance externo.
