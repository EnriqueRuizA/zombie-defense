extends Node2D
## Fase 6: Superviviente mínimo. Representación en mapa (círculo verde) y datos.

@export var survivor_name: String = "Surv"
@export var health: int = 100
## ID de trabajo: idle, scavenge, defend (base management)
var job_id: String = "idle"

const RADIUS: float = 12.0
const COLOR_SURVIVOR := Color(0.2, 0.85, 0.3)


func _draw() -> void:
	draw_circle(Vector2.ZERO, RADIUS, COLOR_SURVIVOR)
	draw_arc(Vector2.ZERO, RADIUS, 0.0, TAU, 16, Color(0.1, 0.5, 0.2), 2.0)


func get_data() -> Dictionary:
	return {
		"name": survivor_name,
		"health": health,
		"job": job_id,
		"node": self
	}
