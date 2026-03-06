extends StaticBody2D
## Muro: bloquea a los infectados. Tiene vida; al llegar a 0 se destruye.

signal destroyed

@export var max_health: int = 40
var health: int = 40

const TILE_SIZE: int = 32
const SIZE_TILES: Vector2i = Vector2i(2, 1)
const COLOR_WALL := Color(0.45, 0.42, 0.38)
const COLOR_DAMAGE := Color(0.6, 0.25, 0.2)


func _ready() -> void:
	health = max_health
	add_to_group("wall")
	_setup_collision()


func _setup_collision() -> void:
	var size := Vector2(SIZE_TILES.x * TILE_SIZE, SIZE_TILES.y * TILE_SIZE)
	var shape := RectangleShape2D.new()
	shape.size = size
	var col: CollisionShape2D = get_node_or_null("CollisionShape2D")
	if col != null:
		col.shape = shape
		col.position = -size * 0.5


func take_damage(amount: int) -> void:
	health -= amount
	if health <= 0:
		destroyed.emit()
		queue_free()
	queue_redraw()


func get_rect_global() -> Rect2:
	var size := Vector2(SIZE_TILES.x * TILE_SIZE, SIZE_TILES.y * TILE_SIZE)
	return Rect2(global_position - size * 0.5, size)


func _draw() -> void:
	var size := Vector2(SIZE_TILES.x * TILE_SIZE, SIZE_TILES.y * TILE_SIZE)
	var t := 1.0 - float(health) / float(max_health)
	var color := COLOR_WALL.lerp(COLOR_DAMAGE, t * 0.5)
	draw_rect(Rect2(-size * 0.5, size), color)
	draw_rect(Rect2(-size * 0.5, size), Color(0.2, 0.2, 0.2), false, 2.0)
