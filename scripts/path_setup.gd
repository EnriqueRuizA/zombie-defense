extends Path2D
## Recorrido dibujado sobre la cuadrícula: estilo carretera (asfalto + líneas de borde).

## Ancho en unidades de mundo; 2.0 = una celda de cuadrícula típica.
const ANCHO_CAMINO: float = 2.0
const PASO_MUESTREO: float = 0.5
const COLOR_ASFALTO: Color = Color(0.25, 0.25, 0.28, 1)
const COLOR_BORDE_OSCURO: Color = Color(0.15, 0.15, 0.18, 1)
const COLOR_LINEA_BORDE: Color = Color(0.95, 0.9, 0.5, 0.9)
const ANCHO_LINEA_BORDE: float = 0.25

func _ready() -> void:
	if curve.get_point_count() >= 2:
		_dibujar_recorrido()


func redibujar_recorrido() -> void:
	for c in get_children():
		if c.name.begins_with("Path"):
			c.queue_free()
	if curve.get_point_count() >= 2:
		_dibujar_recorrido()


func _dibujar_recorrido() -> void:
	var longitud := curve.get_baked_length()
	if longitud <= 0.0:
		return
	var half := ANCHO_CAMINO * 0.5
	var puntos_izq: PackedVector2Array = []
	var puntos_der: PackedVector2Array = []
	var t: float = 0.0
	while t < longitud:
		var p: Vector2 = curve.sample_baked(t)
		var t_sig: float = minf(t + PASO_MUESTREO, longitud)
		var p_sig: Vector2 = curve.sample_baked(t_sig)
		var tang: Vector2 = (p_sig - p).normalized()
		if tang.length_squared() > 0.001:
			var perp := Vector2(-tang.y, tang.x)
			puntos_izq.append(p - perp * half)
			puntos_der.append(p + perp * half)
		t = t_sig
	if puntos_izq.is_empty():
		return
	var p_fin: Vector2 = curve.sample_baked(longitud)
	var p_ant: Vector2 = curve.sample_baked(maxf(0, longitud - 0.5))
	var tang_fin: Vector2 = (p_fin - p_ant).normalized()
	var perp_fin := Vector2(-tang_fin.y, tang_fin.x)
	puntos_izq.append(p_fin - perp_fin * half)
	puntos_der.append(p_fin + perp_fin * half)
	# Capa 1: relleno asfalto
	var poly := Polygon2D.new()
	poly.name = "PathRelleno"
	for i in puntos_izq.size():
		poly.polygon.append(puntos_izq[i])
	for i in range(puntos_der.size() - 1, -1, -1):
		poly.polygon.append(puntos_der[i])
	poly.color = COLOR_ASFALTO
	add_child(poly)
	# Capa 2 y 3: bordes en DOS líneas separadas (izq y der) para no cruzar el camino
	var borde_izq := Line2D.new()
	borde_izq.name = "PathBordeIzq"
	borde_izq.width = 0.4
	borde_izq.default_color = COLOR_BORDE_OSCURO
	for p in puntos_izq:
		borde_izq.add_point(p)
	add_child(borde_izq)
	var borde_der := Line2D.new()
	borde_der.name = "PathBordeDer"
	borde_der.width = 0.4
	borde_der.default_color = COLOR_BORDE_OSCURO
	for p in puntos_der:
		borde_der.add_point(p)
	add_child(borde_der)
	# Líneas amarillas de borde (una por lado, sin cerrar)
	var stripe_izq := Line2D.new()
	stripe_izq.name = "PathStripeIzq"
	stripe_izq.width = ANCHO_LINEA_BORDE
	stripe_izq.default_color = COLOR_LINEA_BORDE
	for p in puntos_izq:
		stripe_izq.add_point(p)
	add_child(stripe_izq)
	var stripe_der := Line2D.new()
	stripe_der.name = "PathStripeDer"
	stripe_der.width = ANCHO_LINEA_BORDE
	stripe_der.default_color = COLOR_LINEA_BORDE
	for p in puntos_der:
		stripe_der.add_point(p)
	add_child(stripe_der)
