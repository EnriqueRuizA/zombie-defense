extends Node2D
## Torre 2D: detecta zombies en rango y dispara proyectiles.

signal torre_colocada

## Tamaño objetivo en unidades de mundo; todas las torres se escalan para verse igual.
const TAMANO_TORRE_UNIDADES: float = 1.0

@export var rango: float = 120.0
@export var daño: int = 10
@export var cadencia: float = 1.6
@export var escena_proyectil: PackedScene

var objetivo_actual: Node2D
var tiempo_siguiente_disparo: float = 0.0
var colocada: bool = false


func _ready() -> void:
	if escena_proyectil == null:
		escena_proyectil = preload("res://scenes/proyectil.tscn") as PackedScene
	var sprite := get_node_or_null("Sprite2D") as Sprite2D
	if sprite and sprite.texture == null:
		var tex: Texture2D = load("res://assets/Units/soldier.png") as Texture2D
		if tex:
			sprite.texture = tex
			_escalar_sprite_tamano_unificado(sprite, tex)
		else:
			var gen = preload("res://scripts/texturas_enemigos.gd").new()
			var tex_gen: Texture2D = gen.crear_textura_torre_militar()
			sprite.texture = tex_gen
			if tex_gen:
				_escalar_sprite_tamano_unificado(sprite, tex_gen)
	if get_parent().name == "Torres":
		colocar()


func aplicar_tipo(info: Dictionary) -> void:
	if info.has("rango"):
		rango = info.rango
	if info.has("daño"):
		daño = info.daño
	if info.has("cadencia"):
		cadencia = info.cadencia
	var sprite := get_node_or_null("Sprite2D") as Sprite2D
	if sprite and info.has("texture"):
		var tex: Texture2D = load(info.texture) as Texture2D
		if tex:
			sprite.texture = tex
			_escalar_sprite_tamano_unificado(sprite, tex)


func _process(delta: float) -> void:
	if not colocada:
		return
	tiempo_siguiente_disparo -= delta
	_buscar_objetivo()
	if objetivo_actual:
		var dir: Vector2 = (objetivo_actual.global_position - global_position).normalized()
		rotation = dir.angle()
		if tiempo_siguiente_disparo <= 0.0:
			_disparar()
			tiempo_siguiente_disparo = cadencia


func _buscar_objetivo() -> void:
	var main_node: Node = get_tree().get_first_node_in_group("game_manager")
	var zombies: Array
	if main_node != null and main_node.has_method("get_zombies_vivos"):
		zombies = main_node.get_zombies_vivos()
	else:
		zombies = get_tree().get_nodes_in_group("zombies")
	var mejor: Node2D = null
	var dist_mejor: float = rango + 1.0
	for z in zombies:
		if not is_instance_valid(z):
			continue
		var d: float = global_position.distance_to(z.global_position)
		if d <= rango and d < dist_mejor:
			dist_mejor = d
			mejor = z as Node2D
	objetivo_actual = mejor


func _disparar() -> void:
	if escena_proyectil == null or objetivo_actual == null:
		return
	var p: Node2D = escena_proyectil.instantiate()
	var main_node: Node = get_tree().get_first_node_in_group("game_manager")
	var contenedor: Node = null
	if main_node != null and main_node.has_method("get_contenedor_proyectiles"):
		contenedor = main_node.get_contenedor_proyectiles()
	if contenedor != null:
		contenedor.add_child(p)
	else:
		get_tree().current_scene.add_child(p)
	var dir_disparo: Vector2 = (objetivo_actual.global_position - global_position).normalized()
	p.global_position = global_position + dir_disparo * 12.0
	if p.has_method("configurar"):
		p.configurar(objetivo_actual, daño)


func _escalar_sprite_tamano_unificado(sprite: Sprite2D, tex: Texture2D) -> void:
	var size_px: float = maxf(tex.get_width(), tex.get_height())
	if size_px > 0.0:
		var s: float = TAMANO_TORRE_UNIDADES / size_px
		sprite.scale = Vector2(s, s)


func colocar() -> void:
	colocada = true
	torre_colocada.emit()
