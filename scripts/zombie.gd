extends Node2D
## Zombie 2D: sigue un Path2D, tiene vida y da recompensa al morir.

signal llegó_al_final
signal zombie_muerto

@export var velocidad: float = 5.0
@export var vida_max: int = 30
@export var daño_base: int = 1
## Offset en radianes para que el sprite mire bien (0, PI/2 si el arte mira hacia arriba)
@export var rotacion_offset_grafico: float = PI / 2.0

## Mismo tamaño que torres/soldados en unidades de mundo.
const TAMANO_SPRITE_UNIDADES: float = 1.0
const TANGENTE_PATH_MAX_DELTA: float = 1.5
const TANGENTE_PATH_EPSILON: float = 0.01

var vida_actual: int
var path_zombies: Path2D
var progreso_en_path: float = 0.0
var _barra_fondo: Polygon2D
var _barra_fill: Polygon2D


func _ready() -> void:
	vida_actual = vida_max
	_crear_barra_vida()
	var sprite := get_node_or_null("Sprite2D") as Sprite2D
	if sprite and sprite.texture == null:
		var tex: Texture2D = load("res://assets/Zombies/zombie hombre.png") as Texture2D
		if tex:
			sprite.texture = tex
		else:
			var gen = preload("res://scripts/texturas_enemigos.gd").new()
			sprite.texture = gen.crear_textura_zombie()
	if sprite != null and sprite.texture != null:
		_escalar_sprite_tamano_unificado(sprite, sprite.texture)


func _escalar_sprite_tamano_unificado(sprite: Sprite2D, tex: Texture2D) -> void:
	var size_px: float = maxf(tex.get_width(), tex.get_height())
	if size_px > 0.0:
		var s: float = TAMANO_SPRITE_UNIDADES / size_px
		sprite.scale = Vector2(s, s)


func set_path_follow(pf: PathFollow2D) -> void:
	if pf != null:
		path_zombies = pf.get_parent() as Path2D
		progreso_en_path = 0.0


func set_path_directo(path: Path2D) -> void:
	path_zombies = path
	progreso_en_path = 0.0


func _process(delta: float) -> void:
	if path_zombies == null or path_zombies.curve.get_point_count() == 0:
		return
	progreso_en_path += velocidad * delta
	var longitud := path_zombies.curve.get_baked_length()
	if progreso_en_path >= longitud:
		llegó_al_final.emit()
		queue_free()
		return
	var pos_path: Vector2 = path_zombies.curve.sample_baked(progreso_en_path)
	global_position = path_zombies.global_transform * pos_path
	# Mirar hacia donde se mueve (tangente del path)
	var delta_t: float = minf(TANGENTE_PATH_MAX_DELTA, longitud - progreso_en_path - TANGENTE_PATH_EPSILON)
	if delta_t > TANGENTE_PATH_EPSILON:
		var pos_sig: Vector2 = path_zombies.curve.sample_baked(progreso_en_path + delta_t)
		var dir_mundo: Vector2 = (path_zombies.global_transform * pos_sig - global_position).normalized()
		if dir_mundo.length_squared() > TANGENTE_PATH_EPSILON:
			rotation = dir_mundo.angle() + rotacion_offset_grafico + PI


func _crear_barra_vida() -> void:
	var contenedor := Node2D.new()
	contenedor.name = "VidaBar"
	contenedor.position = Vector2(0, -1.4)
	add_child(contenedor)
	_barra_fondo = Polygon2D.new()
	_barra_fondo.color = Color(0.4, 0.1, 0.1, 0.9)
	_barra_fondo.polygon = [Vector2(-1, -0.12), Vector2(1, -0.12), Vector2(1, 0.12), Vector2(-1, 0.12)]
	contenedor.add_child(_barra_fondo)
	_barra_fill = Polygon2D.new()
	_barra_fill.color = Color(0.2, 0.75, 0.2, 1)
	_barra_fill.polygon = [Vector2(-1, -0.1), Vector2(-1, -0.1), Vector2(-1, 0.1), Vector2(-1, 0.1)]
	contenedor.add_child(_barra_fill)
	_actualizar_barra_vida()


func _actualizar_barra_vida() -> void:
	if _barra_fill == null or vida_max <= 0:
		return
	var t: float = clampf(float(vida_actual) / float(vida_max), 0.0, 1.0)
	var x: float = -1.0 + 2.0 * t
	_barra_fill.polygon = [Vector2(-1, -0.1), Vector2(x, -0.1), Vector2(x, 0.1), Vector2(-1, 0.1)]


func recibir_daño(cantidad: int) -> void:
	vida_actual -= cantidad
	_actualizar_barra_vida()
	if vida_actual <= 0:
		_morir()


func _morir() -> void:
	var pos_global: Vector2 = global_position
	zombie_muerto.emit()
	var escena_raiz: Node = get_tree().current_scene
	var eff: Node2D = Node2D.new()
	eff.global_position = pos_global
	escena_raiz.add_child(eff)
	eff.set_script(preload("res://scripts/efecto_muerte.gd"))
	queue_free()
