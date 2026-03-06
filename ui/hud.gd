extends CanvasLayer
## FASE 4: HUD superior con día, barra de tiempo y 12 recursos.

const RESOURCE_ORDER: Array[String] = [
	"wood", "raw_metal", "bricks", "basic_tool", "canned_food", "food_rations",
	"bag_grain", "raw_meat", "ammo_crates", "fuel_canister", "fertilizer", "first_aid_kit"
]

@onready var day_label: Label = $Margin/HBox/DayTime/DayLabel
@onready var phase_label: Label = $Margin/HBox/DayTime/PhaseLabel
@onready var time_bar: ProgressBar = $Margin/HBox/DayTime/TimeBar
@onready var hq_warning: Label = $Margin/HBox/HQWarning
@onready var resources_container: HBoxContainer = $Margin/HBox/Resources
@onready var save_btn: Button = $Margin/HBox/SaveBtn

var _resource_labels: Array[Label] = []
var _last_resource_values: Dictionary = {}  # key -> int, para detectar ganancia y dar feedback
const FLASH_DURATION: float = 0.5
const FLASH_COLOR := Color(0.3, 1.0, 0.4)


func _ready() -> void:
	for i in resources_container.get_child_count():
		var row: HBoxContainer = resources_container.get_child(i) as HBoxContainer
		if row:
			var lbl: Node = row.get_node_or_null("Label")
			if lbl is Label:
				_resource_labels.append(lbl as Label)
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null and gm.has_method("get_res"):
		gm.resource_changed.connect(_on_resource_changed)
		gm.time_updated.connect(_on_time_updated)
		gm.day_changed.connect(_on_day_changed)
		_refresh_all_resources(gm)
	_update_day_time()


func _on_resource_changed(key: String, value: int) -> void:
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null:
		var idx: int = RESOURCE_ORDER.find(key)
		if idx >= 0 and idx < _resource_labels.size():
			var prev: int = _last_resource_values.get(key, value)
			if value > prev:
				_flash_resource_label(_resource_labels[idx])
		_last_resource_values[key] = value
		_refresh_all_resources(gm)


func _on_time_updated(_t: float) -> void:
	_update_day_time()


func _on_day_changed(_new_day: int) -> void:
	if day_label != null:
		day_label.add_theme_color_override("font_color", Color(1.0, 0.95, 0.5))
		get_tree().create_timer(0.7).timeout.connect(func(): day_label.remove_theme_color_override("font_color"))
	var sm: Node = get_node_or_null("/root/SoundManager")
	if sm != null and sm.has_method("play_day_change"):
		sm.play_day_change()
	_update_day_time()


func _refresh_all_resources(gm: Node) -> void:
	for i in min(RESOURCE_ORDER.size(), _resource_labels.size()):
		var key: String = RESOURCE_ORDER[i]
		var v: int = gm.get_res(key) if gm.has_method("get_res") else 0
		_resource_labels[i].text = str(v)
		_last_resource_values[key] = v


func _flash_resource_label(lbl: Label) -> void:
	if lbl == null:
		return
	lbl.add_theme_color_override("font_color", FLASH_COLOR)
	get_tree().create_timer(FLASH_DURATION).timeout.connect(func(): _restore_label_color(lbl))


func _restore_label_color(lbl: Label) -> void:
	if lbl != null:
		lbl.remove_theme_color_override("font_color")


func _update_day_time() -> void:
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm == null:
		return
	var d: int = gm.day if gm.get("day") else 1
	var t: float = gm.time if gm.get("time") else 0.0
	var night: bool = t >= 0.6
	day_label.text = "Día %d" % d
	phase_label.text = "Noche" if night else "Día"
	time_bar.value = t
	# Aviso: coloca el HQ antes de que llegue la noche (día 1, tiempo avanzando)
	var hq_placed_val: bool = gm.get("hq_placed") if gm.get("hq_placed") != null else false
	hq_warning.visible = d == 1 and not hq_placed_val and t > 0.35
	if hq_warning.visible:
		hq_warning.text = "¡Coloca el HQ antes del anochecer!"


func _on_save_pressed() -> void:
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null and gm.has_method("save_game"):
		var err: int = gm.save_game()
		if err == OK:
			day_label.text = "Guardado"
			var sm: Node = get_node_or_null("/root/SoundManager")
			if sm != null and sm.has_method("play_save"):
				sm.play_save()
	_update_day_time()


func _process(_delta: float) -> void:
	# Actualizar día/hora por si no hay señal
	_update_day_time()
