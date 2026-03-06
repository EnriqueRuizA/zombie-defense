extends Node2D
## Edificio colocado en suelo (no sobre ruina). Solo visual; tipo almacen o tower.

@export var building_type: String = "almacen"

const TILE_SIZE: int = 32
const SIZE_TILES: Vector2i = Vector2i(4, 4)


func _draw() -> void:
	var size := Vector2(SIZE_TILES.x * TILE_SIZE, SIZE_TILES.y * TILE_SIZE)
	var color: Color
	match building_type:
		"almacen":
			color = Color(0.75, 0.55, 0.2)
		"tower":
			color = Color(0.35, 0.45, 0.7)
		_:
			color = Color(0.5, 0.5, 0.5)
	draw_rect(Rect2(-size * 0.5, size), color)
	draw_rect(Rect2(-size * 0.5, size), Color(0.2, 0.2, 0.2), false, 2.0)
