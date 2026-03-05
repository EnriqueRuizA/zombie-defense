extends Camera2D
## Control cámara 2D: WASD/flechas pan, Q/E/rueda zoom, arrastre con botón central o derecho.

@export var velocidad_pan: float = 400.0
@export var velocidad_zoom_cantidad: float = 0.1
@export var zoom_min: Vector2 = Vector2(0.3, 0.3)
@export var zoom_max: Vector2 = Vector2(2.0, 2.0)
@export var limite_left: float = -800.0
@export var limite_right: float = 800.0
@export var limite_top: float = -600.0
@export var limite_bottom: float = 600.0

var _arrastrando: bool = false
var _ultima_pos_raton: Vector2 = Vector2.ZERO


func _ready() -> void:
	position_smoothing_enabled = true
	position_smoothing_speed = 8.0


func _process(delta: float) -> void:
	# Pan con teclado
	var despl := Vector2.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		despl.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		despl.y += 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		despl.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		despl.x += 1.0
	if despl.length_squared() > 0.0:
		despl = despl.normalized() * velocidad_pan * delta
		position += despl
		position.x = clampf(position.x, limite_left, limite_right)
		position.y = clampf(position.y, limite_top, limite_bottom)
	# Pan con arrastre de ratón
	if _arrastrando:
		var pos_actual: Vector2 = get_viewport().get_mouse_position()
		var delta_raton: Vector2 = pos_actual - _ultima_pos_raton
		position -= delta_raton / zoom
		position.x = clampf(position.x, limite_left, limite_right)
		position.y = clampf(position.y, limite_top, limite_bottom)
		_ultima_pos_raton = pos_actual
	if Input.is_key_pressed(KEY_Q):
		_zoom(1.0)
	if Input.is_key_pressed(KEY_E):
		_zoom(-1.0)


func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			if mb.pressed:
				_zoom(1.0)
			return
		if mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			if mb.pressed:
				_zoom(-1.0)
			return
		# Arrastre: solo botón central (el derecho se usa para cancelar en UI/colocar)
		if mb.button_index == MOUSE_BUTTON_MIDDLE:
			if mb.pressed:
				_arrastrando = true
				_ultima_pos_raton = mb.position
			else:
				_arrastrando = false
	elif event is InputEventMouseMotion and _arrastrando:
		_ultima_pos_raton = (event as InputEventMouseMotion).position


func _zoom(signo: float) -> void:
	var z: Vector2 = zoom
	z += Vector2.ONE * signo * velocidad_zoom_cantidad
	z.x = clampf(z.x, zoom_min.x, zoom_max.x)
	z.y = clampf(z.y, zoom_min.y, zoom_max.y)
	zoom = z
