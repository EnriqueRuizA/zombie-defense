extends Node2D
## Tropa de defensa: dispara a infectados en rango. Reduce su vida hasta eliminarlos.

@export var range_px: float = 140.0
@export var damage: int = 8
@export var fire_interval: float = 1.0

var _fire_timer: float = 0.0

const RADIUS: float = 10.0
const COLOR_TROOP := Color(0.2, 0.5, 0.9)
const COLOR_OUTLINE := Color(0.1, 0.25, 0.5)


func _ready() -> void:
	add_to_group("troop")


func _process(delta: float) -> void:
	if modulate.a < 0.99:
		return
	_fire_timer += delta
	if _fire_timer < fire_interval:
		return
	_fire_timer = 0.0
	var target_infected: Node2D = _get_nearest_infected_in_range()
	if target_infected != null and target_infected.has_method("take_damage"):
		target_infected.take_damage(damage)


func _get_nearest_infected_in_range() -> Node2D:
	var infected_list: Array = get_tree().get_nodes_in_group("infected")
	var best: Node2D = null
	var best_dist: float = range_px
	for node in infected_list:
		var inf: Node2D = node as Node2D
		if inf == null or not is_instance_valid(inf):
			continue
		var d: float = global_position.distance_to(inf.global_position)
		if d < best_dist:
			best_dist = d
			best = inf
	return best


func _draw() -> void:
	draw_circle(Vector2.ZERO, RADIUS, COLOR_OUTLINE)
	draw_circle(Vector2.ZERO, RADIUS - 2.0, COLOR_TROOP)
	# Indicar rango (muy sutil)
	draw_arc(Vector2.ZERO, range_px, 0.0, TAU, 32, Color(0.2, 0.4, 0.7, 0.15), 1.0)
