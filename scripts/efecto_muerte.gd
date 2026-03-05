extends Node2D
## Efecto visual al morir un zombie: círculo que se expande y desvanece.

var _tiempo: float = 0.0
const DURACION: float = 0.35

func _ready() -> void:
	var poly := Polygon2D.new()
	poly.color = Color(0.9, 0.2, 0.1, 0.85)
	var pts: PackedVector2Array = []
	for i in range(16):
		var a: float = i * TAU / 16.0
		pts.append(Vector2(0.25 * cos(a), 0.25 * sin(a)))
	poly.polygon = pts
	add_child(poly)


func _process(delta: float) -> void:
	_tiempo += delta
	var t: float = _tiempo / DURACION
	if t >= 1.0:
		queue_free()
		return
	scale = Vector2(1.0 + t * 3.0, 1.0 + t * 3.0)
	modulate.a = 1.0 - t
