extends Node
## Hace el juego jugable: victoria (supervivir día 3), derrota (noche día 1 sin HQ o infectados al HQ),
## oscurecer de noche, oleadas de infectados y paneles de fin de partida.

@onready var lose_panel: Panel = $LosePanel
@onready var win_panel: Panel = $WinPanel
@onready var btn_menu_lose: Button = $LosePanel/VBox/MenuBtn
@onready var btn_menu_win: Button = $WinPanel/VBox/MenuBtn
@onready var lose_msg: Label = $LosePanel/VBox/Msg

## Día: tono azul grisáceo suave. Noche: crepúsculo legible (no casi negro).
const COLOR_DAY := Color(0.22, 0.25, 0.32, 1)
const COLOR_NIGHT := Color(0.32, 0.35, 0.52, 1)

const INFECTED_SCENE := preload("res://scenes/infected.tscn")
const MAP_SIZE_PX: float = 4096.0

var _game_ended: bool = false
var _canvas_modulate: CanvasModulate
var _infected_container: Node2D


func _ready() -> void:
	# Crítico: cuando el juego se pausa (derrota/victoria), este nodo y sus hijos
	# deben seguir procesando para que los botones "Menú principal" respondan.
	process_mode = Node.PROCESS_MODE_ALWAYS

	var parent: Node = get_parent()
	_canvas_modulate = parent.get_node_or_null("CanvasModulate") as CanvasModulate
	_infected_container = parent.get_node_or_null("Infected") as Node2D

	lose_panel.visible = false
	win_panel.visible = false
	lose_panel.process_mode = Node.PROCESS_MODE_ALWAYS
	win_panel.process_mode = Node.PROCESS_MODE_ALWAYS
	btn_menu_lose.pressed.connect(_go_to_menu)
	btn_menu_win.pressed.connect(_go_to_menu)

	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null:
		gm.night_started.connect(_on_night_started)
		gm.day_changed.connect(_on_day_changed)


func _process(_delta: float) -> void:
	if _game_ended:
		return
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null and _canvas_modulate != null:
		var t: float = gm.get("time") if gm.get("time") != null else 0.0
		# Transición suave al anochecer (0.5–0.7) para que no sea corte brusco
		var night_factor: float = 0.0
		if t >= 0.7:
			night_factor = 1.0
		elif t >= 0.5:
			night_factor = (t - 0.5) / 0.2
		_canvas_modulate.color = COLOR_DAY.lerp(COLOR_NIGHT, night_factor)


func _on_night_started(day_num: int) -> void:
	if _game_ended:
		return
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm == null:
		return
	if not gm.get("hq_placed"):
		_trigger_lose("La noche llegó sin tener el HQ. No sobreviviste.")
		return
	# Oleada: spawn infectados que no son neutralizados por defensores
	var defenders: int = gm.get_defender_count() if gm.has_method("get_defender_count") else 0
	var to_spawn: int = maxi(0, 2 + day_num - defenders)
	if to_spawn > 0 and _infected_container != null:
		_spawn_infected(to_spawn, gm.get("hq_position") if gm.get("hq_position") != null else Vector2(MAP_SIZE_PX * 0.5, MAP_SIZE_PX * 0.5))


func _on_day_changed(new_day: int) -> void:
	if _game_ended:
		return
	_clear_infected()
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm == null:
		return
	if new_day >= 3 and gm.get("hq_placed"):
		_trigger_win()


func _spawn_infected(count: int, hq_pos: Vector2) -> void:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	for i in count:
		var inf: Node2D = INFECTED_SCENE.instantiate() as Node2D
		if inf == null:
			continue
		# Posición en un borde del mapa (px 0..4096)
		var side: int = rng.randi_range(0, 3)
		if side == 0:
			inf.position = Vector2(rng.randf_range(0, MAP_SIZE_PX), 0)
		elif side == 1:
			inf.position = Vector2(MAP_SIZE_PX, rng.randf_range(0, MAP_SIZE_PX))
		elif side == 2:
			inf.position = Vector2(rng.randf_range(0, MAP_SIZE_PX), MAP_SIZE_PX)
		else:
			inf.position = Vector2(0, rng.randf_range(0, MAP_SIZE_PX))
		inf.set("target", hq_pos)
		if inf.has_signal("reached_hq"):
			inf.reached_hq.connect(_on_infected_reached_hq)
		_infected_container.add_child(inf)


func _on_infected_reached_hq() -> void:
	if _game_ended:
		return
	_trigger_lose("Los infectados han llegado al HQ. La base ha caído.")


func _clear_infected() -> void:
	if _infected_container == null:
		return
	for c in _infected_container.get_children():
		c.queue_free()


func _trigger_lose(msg: String = "La noche llegó sin tener el HQ. No sobreviviste.") -> void:
	_game_ended = true
	if lose_msg != null:
		lose_msg.text = msg
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null:
		if gm.has_method("set"):
			gm.set("is_paused", true)
		if gm.has_method("save_game"):
			gm.save_game()
	lose_panel.visible = true


func _trigger_win() -> void:
	_game_ended = true
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null:
		if gm.has_method("set"):
			gm.set("is_paused", true)
		if gm.has_method("save_game"):
			gm.save_game()
	win_panel.visible = true


func _go_to_menu() -> void:
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null and gm.has_method("set"):
		gm.set("is_paused", false)
	get_tree().change_scene_to_file("res://scenes/main.tscn")
