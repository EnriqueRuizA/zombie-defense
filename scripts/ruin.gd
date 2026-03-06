extends StaticBody2D
## FASE 2: Edificio en ruinas básico.
## Representa una manzana gris oscura con colisión y resaltado al pasar el ratón.

signal adapt(type: String)

@export var size_tiles: Vector2i = Vector2i(6, 6)

var size_m3: float = 0.0
## "" = ruina seleccionable; "hq" = ya adaptado como HQ (Fase 5).
var building_type: String = ""

@onready var _shape: CollisionShape2D = $CollisionShape2D
@onready var _sprite: Sprite2D = $Sprite2D

const TILE_SIZE: int = 32
const COLOR_BASE := Color8(0x40, 0x40, 0x40, 0xFF)
const COLOR_HIGHLIGHT := Color(1.0, 1.0, 0.2, 0.9)
const COLOR_SELECTED := Color(0.0, 1.0, 1.0, 1.0)

var _base_texture: Texture2D
var _selected: bool = false


func _ready() -> void:
	size_m3 = float(size_tiles.x * size_tiles.y) * 4.0
	_setup_collision()
	_setup_visual()
	input_pickable = true
	mouse_entered.connect(_on_mouse_entered)
	mouse_exited.connect(_on_mouse_exited)


func _setup_collision() -> void:
	var rect := RectangleShape2D.new()
	rect.size = Vector2(size_tiles.x * TILE_SIZE, size_tiles.y * TILE_SIZE)
	_shape.shape = rect


func _setup_visual() -> void:
	if _base_texture == null:
		var img := Image.create(TILE_SIZE, TILE_SIZE, false, Image.FORMAT_RGBA8)
		img.fill(COLOR_BASE)
		_base_texture = ImageTexture.create_from_image(img)
	_sprite.texture = _base_texture
	_sprite.centered = true
	_sprite.position = Vector2.ZERO
	_sprite.scale = Vector2(size_tiles.x, size_tiles.y)


func _on_mouse_entered() -> void:
	if not _selected:
		_sprite.modulate = COLOR_HIGHLIGHT


func _on_mouse_exited() -> void:
	if not _selected:
		_sprite.modulate = Color.WHITE


func set_selected(selected: bool) -> void:
	_selected = selected
	if _selected:
		_sprite.modulate = COLOR_SELECTED
	else:
		_sprite.modulate = Color.WHITE


## Fase 5: convertir esta ruina en HQ (visual verde).
func adapt_to_hq() -> void:
	_adapt_to_building_type("hq")


## Base management: convertir ruina en edificio (hq, almacen, tower).
func adapt_to_building_type(type: String) -> void:
	_adapt_to_building_type(type)


func _adapt_to_building_type(type: String) -> void:
	if building_type != "":
		return
	building_type = type
	match type:
		"hq":
			_sprite.modulate = Color(0.2, 0.8, 0.2)
		"almacen":
			_sprite.modulate = Color(0.75, 0.55, 0.2)
		"tower":
			_sprite.modulate = Color(0.35, 0.45, 0.7)
		_:
			_sprite.modulate = Color.WHITE
	_selected = false
	adapt.emit(type)

