extends Node2D
## Infectado (zombie agresor): se mueve hacia el HQ. Tiene vida; las tropas le disparan.
## Si choca con un muro, lo daña y se detiene. Si llega al HQ, emite reached_hq.

signal reached_hq

@export var speed: float = 80.0
@export var reach_distance: float = 48.0
@export var max_health: int = 20
@export var wall_damage_per_sec: int = 15

var target: Vector2 = Vector2.ZERO
var health: int = 20

const RADIUS: float = 14.0
const COLOR_INFECTED := Color(0.7, 0.15, 0.1)
const COLOR_OUTLINE := Color(0.4, 0.05, 0.02)


func _ready() -> void:
	health = max_health
	add_to_group("infected")


func take_damage(amount: int) -> void:
	health -= amount
	if health <= 0:
		queue_free()
	queue_redraw()


func _process(delta: float) -> void:
	if target == Vector2.ZERO:
		return
	if health <= 0:
		return
	var dir: Vector2 = (target - global_position).normalized()
	var move := dir * speed * delta
	var next_pos: Vector2 = global_position + move
	# Comprobar muros: si el movimiento nos mete en un muro, dañarlo y no avanzar
	var wall_hit: Node = _get_wall_at(next_pos)
	if wall_hit != null and wall_hit.has_method("take_damage"):
		wall_hit.take_damage(int(wall_damage_per_sec * delta))
		return
	global_position = next_pos
	if global_position.distance_to(target) < reach_distance:
		reached_hq.emit()
		queue_free()


func _get_wall_at(pos: Vector2) -> Node:
	var walls: Array = get_tree().get_nodes_in_group("wall")
	for w in walls:
		var wall_node: Node = w as Node
		if not wall_node.has_method("get_rect_global"):
			continue
		var rect: Rect2 = wall_node.get_rect_global()
		if rect.has_point(pos):
			return wall_node
	return null


func _draw() -> void:
	draw_circle(Vector2.ZERO, RADIUS, COLOR_OUTLINE)
	draw_circle(Vector2.ZERO, RADIUS - 2.0, COLOR_INFECTED)
	if health < max_health:
		var bar_w: float = RADIUS * 2.0
		var t: float = float(health) / float(max_health)
		draw_rect(Rect2(-RADIUS, -RADIUS - 6, bar_w, 4), Color(0.2, 0.2, 0.2))
		draw_rect(Rect2(-RADIUS, -RADIUS - 6, bar_w * t, 4), Color(0.8, 0.2, 0.1))
