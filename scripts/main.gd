class_name Main
extends Node2D
## Game Manager 2D isométrico: oleadas, oro, vidas, colocación de torres.

## Grupo para que torres/UI obtengan referencia sin depender del árbol: "game_manager"

signal oro_cambiado(nuevo_oro: int)
signal vidas_cambiadas(vidas: int)
signal oleada_iniciada(numero: int)
signal oleada_terminada(numero: int)
signal juego_perdido()
signal juego_ganado()
signal modo_colocar_torre_cambiado(activo: bool)
signal modo_reubicar_torre_cambiado(activo: bool)
signal torre_seleccionada_para_reubicar(torre: Node2D)
signal torre_colocada_en_mapa()
signal iniciar_oleada_fallido(mensaje: String)
signal recorrido_actualizado()

@export var oro_inicial: int = 100
@export var vidas_iniciales: int = 20
@export var oro_por_zombie: int = 5
@export var tiempo_entre_oleadas: float = 5.0
# Valores por defecto desde Balance si existe (ajusta en scripts/balance.gd)
@export var escena_torre: PackedScene
@export var distancia_minima_al_path: float = 3.0

const ORO_MAX: int = 99999
const VIDAS_MAX: int = 999
const PASO_DISTANCIA_PATH: float = 2.0
const DISTANCIA_PATH_DEFAULT: float = 9999.0
const FACTOR_VIDA_POR_OLEADA: float = 0.15
const FACTOR_VELOCIDAD_POR_OLEADA: float = 0.06
const VIDA_BASE_ZOMBIE: int = 30
const VELOCIDAD_BASE_ZOMBIE: float = 5.0

## Cuadrícula: todo el juego es coherente con ella (torres, recorrido, suelo).
var TAMANO_CELDA: float = 2.0
var CELDAS_POR_EJE: int = 25
var RECT_SUELO: Rect2 = Rect2(-25, -25, 50, 50)

## Tipos de torre: id -> { costo, rango, daño, cadencia, texture_path }
var tipos_torre: Dictionary = {
	"recruit": { "costo": 30, "rango": 90.0, "daño": 6, "cadencia": 1.8, "texture": "res://assets/Units/recruit.png" },
	"soldier": { "costo": 50, "rango": 120.0, "daño": 10, "cadencia": 1.6, "texture": "res://assets/Units/soldier.png" },
	"sniper": { "costo": 80, "rango": 200.0, "daño": 25, "cadencia": 2.0, "texture": "res://assets/Units/sniper.png" }
}

var oro: int:
	set(v):
		oro = clampi(v, 0, ORO_MAX)
		oro_cambiado.emit(oro)

var vidas: int:
	set(v):
		vidas = clampi(v, 0, VIDAS_MAX)
		vidas_cambiadas.emit(vidas)
		if vidas <= 0:
			_modo_colocar_torre_off()
			juego_perdido.emit()

var oleada_actual: int = 0
var zombies_restantes_en_oleada: int = 0
var zombies_eliminados: int = 0
var modo_colocar_torre: bool = false
var modo_reubicar_torre: bool = false
var torre_tipo_seleccionado: String = ""
var _torre_reubicar: Node2D = null

var _lista_zombies_cache: Array[Node2D] = []
var _nodo_cuadricula: Node2D
var _preview_celda_recorrido: Node2D
var _rango_preview: Node2D
var _rango_preview_line: Line2D

@onready var mundo: Node2D = $Mundo
@onready var path_zombies: Path2D = $Mundo/Path2D
@onready var contenedor_zombies: Node2D = $Mundo/Zombies
@onready var contenedor_torres: Node2D = $Mundo/Torres
@onready var contenedor_proyectiles: Node2D = $Mundo/Proyectiles
@onready var punto_spawn: PathFollow2D = $Mundo/Path2D/SpawnPoint


func _get_oleada_victoria() -> int:
	var b: Node = get_node_or_null("/root/Balance")
	if b != null and b.get("OLEADA_VICTORIA") != null:
		return int(b.OLEADA_VICTORIA)
	return 10


func _ready() -> void:
	add_to_group("game_manager")
	_inicializar_cuadricula_desde_balance()
	oro = oro_inicial
	vidas = vidas_iniciales
	zombies_eliminados = 0
	if escena_torre == null:
		escena_torre = preload("res://scenes/tower.tscn") as PackedScene
	_conectar_zombies()
	_crear_rango_preview()
	_crear_cuadricula()
	_crear_preview_celda_recorrido()


func _process(_delta: float) -> void:
	_lista_zombies_cache.clear()
	for child in contenedor_zombies.get_children():
		if is_instance_valid(child) and child is Node2D:
			_lista_zombies_cache.append(child as Node2D)
	var planif: bool = en_fase_planificacion()
	if _nodo_cuadricula != null:
		_nodo_cuadricula.visible = planif
	# Resaltar celda bajo el ratón al pintar el recorrido (solo en planificación, sin otros modos)
	if _preview_celda_recorrido != null:
		var mostrar_preview: bool = planif and not modo_colocar_torre and not modo_reubicar_torre
		if mostrar_preview:
			var pos_mundo: Variant = _obtener_posicion_raton_mundo()
			if pos_mundo != null:
				var centro: Vector2 = snap_a_centro_celda(pos_mundo as Vector2)
				_preview_celda_recorrido.position = centro
				_preview_celda_recorrido.visible = true
			else:
				_preview_celda_recorrido.visible = false
		else:
			_preview_celda_recorrido.visible = false
	if modo_colocar_torre and not torre_tipo_seleccionado.is_empty():
		var pos_mundo: Variant = _obtener_posicion_raton_mundo()
		if pos_mundo != null and _rango_preview != null:
			var info: Dictionary = tipos_torre.get(torre_tipo_seleccionado, {})
			var rango: float = info.get("rango", 100.0)
			_rango_preview.visible = true
			_rango_preview.position = snap_a_centro_celda(pos_mundo as Vector2)
			_rango_preview.scale = Vector2(rango, rango)
		elif _rango_preview != null:
			_rango_preview.visible = false
	elif _rango_preview != null:
		_rango_preview.visible = false


func get_zombies_vivos() -> Array[Node2D]:
	return _lista_zombies_cache.duplicate()


func en_fase_planificacion() -> bool:
	return oleada_actual == 0


func get_cantidad_puntos_recorrido() -> int:
	return path_zombies.curve.get_point_count() if path_zombies != null else 0


func añadir_punto_recorrido(pos_mundo: Vector2) -> void:
	if path_zombies == null:
		return
	var snap: Vector2 = snap_a_centro_celda(pos_mundo)
	if not RECT_SUELO.has_point(snap):
		return
	var n: int = path_zombies.curve.get_point_count()
	if n > 0:
		var ultimo: Vector2 = path_zombies.curve.get_point_position(n - 1)
		if ultimo.distance_to(snap) < TAMANO_CELDA * 0.5:
			return
	path_zombies.curve.add_point(snap)
	if path_zombies.has_method("redibujar_recorrido"):
		path_zombies.redibujar_recorrido()
	recorrido_actualizado.emit()


func limpiar_recorrido() -> void:
	if path_zombies == null:
		return
	path_zombies.curve.clear_points()
	if path_zombies.has_method("redibujar_recorrido"):
		path_zombies.redibujar_recorrido()
	recorrido_actualizado.emit()


func _input(event: InputEvent) -> void:
	# Dibujar recorrido en cuadrícula (solo en planificación, sin otros modos)
	if en_fase_planificacion() and not modo_colocar_torre and not modo_reubicar_torre:
		if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			if _clic_sobre_ui(event.position):
				return
			var pos: Variant = _obtener_posicion_click_mundo(event.position)
			if pos != null:
				añadir_punto_recorrido(pos as Vector2)
				get_viewport().set_input_as_handled()
				return
	if event.is_action_pressed("ui_cancel"):
		if modo_colocar_torre:
			_modo_colocar_torre_off()
		elif modo_reubicar_torre:
			_modo_reubicar_torre_off()
		return
	# Modo reubicar torre
	if modo_reubicar_torre and event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			var pos: Variant = _obtener_posicion_click_mundo(event.position)
			if pos == null:
				return
			var pos_v: Vector2 = pos as Vector2
			if _torre_reubicar == null:
				_seleccionar_torre_para_reubicar(pos_v)
			else:
				_reubicar_torre_en(pos_v)
			get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			_modo_reubicar_torre_off()
			get_viewport().set_input_as_handled()
		return
	# Modo colocar torre
	if not modo_colocar_torre:
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var pos: Variant = _obtener_posicion_click_mundo(event.position)
		if pos != null:
			intentar_colocar_torre(pos as Vector2)
			_modo_colocar_torre_off()
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
		_modo_colocar_torre_off()
		get_viewport().set_input_as_handled()


func _conectar_zombies() -> void:
	for child in contenedor_zombies.get_children():
		if child.has_signal("llegó_al_final"):
			child.llegó_al_final.connect(_on_zombie_llegó_al_final)
		if child.has_signal("zombie_muerto"):
			child.zombie_muerto.connect(_on_zombie_muerto)


func iniciar_oleada(zombies_count: int) -> bool:
	if get_cantidad_puntos_recorrido() < 2:
		iniciar_oleada_fallido.emit("Dibuja un recorrido con al menos 2 puntos en el mapa.")
		return false
	oleada_actual += 1
	zombies_restantes_en_oleada = zombies_count
	oleada_iniciada.emit(oleada_actual)
	return true


func spawn_zombie(zombie_scene: PackedScene) -> void:
	if not path_zombies or path_zombies.curve.get_point_count() == 0:
		return
	var z = zombie_scene.instantiate()
	var factor_vida: float = 1.0 + (oleada_actual - 1) * FACTOR_VIDA_POR_OLEADA
	var factor_vel: float = 1.0 + (oleada_actual - 1) * FACTOR_VELOCIDAD_POR_OLEADA
	z.set("vida_max", int(VIDA_BASE_ZOMBIE * factor_vida))
	z.set("velocidad", VELOCIDAD_BASE_ZOMBIE * factor_vel)
	contenedor_zombies.add_child(z)
	var inicio_path: Vector2 = path_zombies.curve.sample_baked(0.0)
	z.global_position = path_zombies.global_transform * inicio_path
	if z.has_method("set_path_follow"):
		z.set_path_follow(punto_spawn)
	if z.has_signal("llegó_al_final"):
		z.llegó_al_final.connect(_on_zombie_llegó_al_final)
	if z.has_signal("zombie_muerto"):
		z.zombie_muerto.connect(_on_zombie_muerto)


func _on_zombie_llegó_al_final() -> void:
	vidas -= 1
	zombies_restantes_en_oleada -= 1
	if zombies_restantes_en_oleada <= 0:
		oleada_terminada.emit(oleada_actual)
		if oleada_actual >= _get_oleada_victoria():
			juego_ganado.emit()


func _on_zombie_muerto() -> void:
	zombies_eliminados += 1
	oro += oro_por_zombie
	zombies_restantes_en_oleada -= 1
	if zombies_restantes_en_oleada <= 0:
		oleada_terminada.emit(oleada_actual)
		if oleada_actual >= _get_oleada_victoria():
			juego_ganado.emit()


func get_path_zombies() -> Path2D:
	return path_zombies


func get_contenedor_proyectiles() -> Node2D:
	return contenedor_proyectiles


func activar_modo_colocar_torre(tipo_id: String = "soldier") -> void:
	if not tipos_torre.has(tipo_id):
		return
	var info: Dictionary = tipos_torre[tipo_id]
	if oro < info.costo or vidas <= 0:
		return
	torre_tipo_seleccionado = tipo_id
	modo_colocar_torre = true
	modo_colocar_torre_cambiado.emit(true)


func _modo_colocar_torre_off() -> void:
	torre_tipo_seleccionado = ""
	modo_colocar_torre = false
	modo_colocar_torre_cambiado.emit(false)
	if modo_reubicar_torre:
		_modo_reubicar_torre_off()


func activar_modo_reubicar_torre() -> void:
	if vidas <= 0:
		return
	_modo_colocar_torre_off()
	_torre_reubicar = null
	modo_reubicar_torre = true
	modo_reubicar_torre_cambiado.emit(true)


func cancelar_modo_reubicar_torre() -> void:
	_modo_reubicar_torre_off()


func _modo_reubicar_torre_off() -> void:
	_torre_reubicar = null
	modo_reubicar_torre = false
	modo_reubicar_torre_cambiado.emit(false)


func _seleccionar_torre_para_reubicar(pos_mundo: Vector2) -> void:
	var punto_global: Vector2 = mundo.global_transform * pos_mundo
	var mejor: Node2D = null
	var dist_mejor: float = TAMANO_CELDA * 1.2
	for child in contenedor_torres.get_children():
		if not is_instance_valid(child) or not child is Node2D:
			continue
		var t: Node2D = child as Node2D
		var d: float = (t.global_position - punto_global).length()
		if d < dist_mejor:
			dist_mejor = d
			mejor = t
	_torre_reubicar = mejor
	torre_seleccionada_para_reubicar.emit(mejor)


func _reubicar_torre_en(pos_mundo: Vector2) -> void:
	if _torre_reubicar == null or not is_instance_valid(_torre_reubicar):
		_modo_reubicar_torre_off()
		return
	var pos_snap: Vector2 = snap_a_centro_celda(pos_mundo)
	var punto_global: Vector2 = mundo.global_transform * pos_snap
	if _distancia_al_path(punto_global) < distancia_minima_al_path:
		return
	_torre_reubicar.position = pos_snap
	_torre_reubicar = null
	modo_reubicar_torre_cambiado.emit(false)
	modo_reubicar_torre = false


func _distancia_al_path(punto_global: Vector2) -> float:
	if path_zombies == null or path_zombies.curve.get_point_count() == 0:
		return DISTANCIA_PATH_DEFAULT
	var punto_local: Vector2 = path_zombies.global_transform.affine_inverse() * punto_global
	var longitud := path_zombies.curve.get_baked_length()
	var dist_min: float = DISTANCIA_PATH_DEFAULT
	var t: float = 0.0
	while t < longitud:
		var p: Vector2 = path_zombies.curve.sample_baked(t)
		dist_min = minf(dist_min, punto_local.distance_to(p))
		t += PASO_DISTANCIA_PATH
	return dist_min


func _obtener_posicion_click_mundo(mouse_pantalla: Vector2) -> Variant:
	if mundo == null:
		return null
	var vp := get_viewport()
	var cam: Camera2D = vp.get_camera_2d()
	var world_pos: Vector2
	if cam != null:
		var vp_rect: Rect2 = vp.get_visible_rect()
		var centro: Vector2 = vp_rect.size / 2
		world_pos = cam.global_position + (mouse_pantalla - centro) / cam.zoom
	else:
		world_pos = vp.get_canvas_transform().affine_inverse() * mouse_pantalla
	var pos_logical: Vector2 = mundo.to_local(world_pos)
	if not RECT_SUELO.has_point(pos_logical):
		return null
	return pos_logical


func _obtener_posicion_raton_mundo() -> Variant:
	return _obtener_posicion_click_mundo(get_viewport().get_mouse_position())


## Devuelve true si la posición en pantalla está sobre la UI (panel/botones), para no añadir puntos al recorrido.
func _clic_sobre_ui(pos_pantalla: Vector2) -> bool:
	var ui: Node = get_node_or_null("UI")
	if ui == null:
		return false
	var panel: Node = ui.get_node_or_null("Panel")
	if panel == null or not panel is Control:
		return false
	var rect: Rect2 = (panel as Control).get_global_rect()
	return rect.has_point(pos_pantalla)


func _inicializar_cuadricula_desde_balance() -> void:
	var b: Node = get_node_or_null("/root/Balance")
	if b != null and b.get("TAMANO_CELDA") != null and b.get("CELDAS_POR_EJE") != null:
		TAMANO_CELDA = float(b.TAMANO_CELDA)
		CELDAS_POR_EJE = int(b.CELDAS_POR_EJE)
	var medio: float = (CELDAS_POR_EJE * TAMANO_CELDA) * 0.5
	RECT_SUELO = Rect2(-medio, -medio, CELDAS_POR_EJE * TAMANO_CELDA, CELDAS_POR_EJE * TAMANO_CELDA)


## Devuelve la posición snapada al centro de la celda de la cuadrícula (todo el juego usa esto).
func snap_a_centro_celda(pos: Vector2) -> Vector2:
	var medio: float = (CELDAS_POR_EJE * TAMANO_CELDA) * 0.5
	var min_centro: float = -medio + TAMANO_CELDA * 0.5
	var max_centro: float = medio - TAMANO_CELDA * 0.5
	var sx: float = roundf(pos.x / TAMANO_CELDA) * TAMANO_CELDA
	var sy: float = roundf(pos.y / TAMANO_CELDA) * TAMANO_CELDA
	sx = clampf(sx, min_centro, max_centro)
	sy = clampf(sy, min_centro, max_centro)
	return Vector2(sx, sy)


func _crear_rango_preview() -> void:
	_rango_preview = Node2D.new()
	_rango_preview.name = "RangoPreview"
	_rango_preview.visible = false
	mundo.add_child(_rango_preview)
	_rango_preview_line = Line2D.new()
	_rango_preview_line.width = 2.0
	_rango_preview_line.default_color = Color(1, 1, 0.4, 0.35)
	var pts: PackedVector2Array = []
	for i in range(33):
		var a: float = i * TAU / 32.0
		pts.append(Vector2(cos(a), sin(a)))
	_rango_preview_line.points = pts
	_rango_preview.add_child(_rango_preview_line)


func _crear_cuadricula() -> void:
	_nodo_cuadricula = Node2D.new()
	_nodo_cuadricula.name = "Cuadricula"
	_nodo_cuadricula.visible = en_fase_planificacion()
	mundo.add_child(_nodo_cuadricula)
	mundo.move_child(_nodo_cuadricula, 0)
	var line: Line2D = Line2D.new()
	line.width = 1.0
	line.default_color = Color(0.4, 0.45, 0.5, 0.4)
	var pts: PackedVector2Array = []
	var min_x: float = RECT_SUELO.position.x
	var max_x: float = RECT_SUELO.position.x + RECT_SUELO.size.x
	var min_y: float = RECT_SUELO.position.y
	var max_y: float = RECT_SUELO.position.y + RECT_SUELO.size.y
	var paso: float = TAMANO_CELDA
	var x: float = min_x
	while x <= max_x:
		pts.append(Vector2(x, min_y))
		pts.append(Vector2(x, max_y))
		x += paso
	var y: float = min_y
	while y <= max_y:
		pts.append(Vector2(min_x, y))
		pts.append(Vector2(max_x, y))
		y += paso
	line.points = pts
	_nodo_cuadricula.add_child(line)


func _crear_preview_celda_recorrido() -> void:
	_preview_celda_recorrido = Node2D.new()
	_preview_celda_recorrido.name = "PreviewCeldaRecorrido"
	_preview_celda_recorrido.visible = false
	mundo.add_child(_preview_celda_recorrido)
	mundo.move_child(_preview_celda_recorrido, 1)
	var half: float = TAMANO_CELDA * 0.5
	var poly: Polygon2D = Polygon2D.new()
	poly.color = Color(0.4, 0.6, 0.5, 0.35)
	poly.polygon = [Vector2(-half, -half), Vector2(half, -half), Vector2(half, half), Vector2(-half, half)]
	_preview_celda_recorrido.add_child(poly)


func intentar_colocar_torre(posicion_logica: Vector2) -> void:
	if escena_torre == null or torre_tipo_seleccionado.is_empty():
		return
	var info: Dictionary = tipos_torre.get(torre_tipo_seleccionado, {})
	if info.is_empty() or oro < info.costo:
		return
	var pos_celda: Vector2 = snap_a_centro_celda(posicion_logica)
	var punto_global: Vector2 = mundo.global_transform * pos_celda
	if _distancia_al_path(punto_global) < distancia_minima_al_path:
		return
	# Evitar dos torres en la misma celda
	for child in contenedor_torres.get_children():
		if child is Node2D and (child as Node2D).position.distance_to(pos_celda) < TAMANO_CELDA * 0.5:
			return
	var torre: Node2D = escena_torre.instantiate()
	torre.position = pos_celda
	if torre.has_method("aplicar_tipo"):
		torre.aplicar_tipo(info)
	contenedor_torres.add_child(torre)
	oro -= info.costo
	torre_colocada_en_mapa.emit()
