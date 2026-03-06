extends Node2D
## Infectado (oleada nocturna): se mueve hacia el HQ. Si llega, emite reached_hq.

signal reached_hq

@export var speed: float = 80.0
@export var reach_distance: float = 48.0

var target: Vector2 = Vector2.ZERO

const RADIUS: float = 14.0
const COLOR_INFECTED := Color(0.7, 0.15, 0.1)
const COLOR_OUTLINE := Color(0.4, 0.05, 0.02)


func _process(delta: float) -> void:
	if target == Vector2.ZERO:
		return
	var dir: Vector2 = (target - global_position).normalized()
	global_position += dir * speed * delta
	if global_position.distance_to(target) < reach_distance:
		reached_hq.emit()
		queue_free()


func _draw() -> void:
	draw_circle(Vector2.ZERO, RADIUS, COLOR_OUTLINE)
	draw_circle(Vector2.ZERO, RADIUS - 2.0, COLOR_INFECTED)
