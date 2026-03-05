extends Node2D
## Proyectil 2D: vuela hacia el objetivo y aplica daño al impactar.

@export var velocidad: float = 300.0

const DISTANCIA_IMPACTO: float = 12.0

var objetivo: Node2D
var daño: int = 10


func configurar(obj: Node2D, d: int) -> void:
	objetivo = obj
	daño = d


func _process(delta: float) -> void:
	if not is_instance_valid(objetivo):
		queue_free()
		return
	var dir: Vector2 = (objetivo.global_position - global_position).normalized()
	global_position += dir * velocidad * delta
	if global_position.distance_to(objetivo.global_position) < DISTANCIA_IMPACTO:
		if is_instance_valid(objetivo) and objetivo.has_method("recibir_daño"):
			objetivo.recibir_daño(daño)
		queue_free()
