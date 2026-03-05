extends Control
## Menú principal: Jugar, Opciones, Salir. Opciones guarda volumen en ConfigFile.

@onready var boton_jugar: Button = $VBox/JugarBtn
@onready var boton_opciones: Button = $VBox/OpcionesBtn
@onready var boton_salir: Button = $VBox/SalirBtn
@onready var panel_opciones: Panel = $PanelOpciones
@onready var slider_volumen: HSlider = $PanelOpciones/VBox/VolumenSlider
@onready var cerrar_opciones_btn: Button = $PanelOpciones/VBox/CerrarOpcionesBtn

const CONFIG_PATH: String = "user://config.cfg"
const SECCION: String = "audio"
const KEY_VOLUMEN: String = "volumen_db"

func _ready() -> void:
	boton_jugar.pressed.connect(_on_jugar_pressed)
	boton_opciones.pressed.connect(_on_opciones_pressed)
	boton_salir.pressed.connect(_on_salir_pressed)
	cerrar_opciones_btn.pressed.connect(_on_cerrar_opciones_pressed)
	panel_opciones.visible = false
	_cargar_opciones()
	slider_volumen.value_changed.connect(_on_volumen_changed)


func _get_audio_manager() -> Node:
	return get_node_or_null("/root/AudioManager")


func _cargar_opciones() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) == OK and cfg.has_section_key(SECCION, KEY_VOLUMEN):
		slider_volumen.value = cfg.get_value(SECCION, KEY_VOLUMEN, 0.8)
	var am: Node = _get_audio_manager()
	if am != null and am.has_method("set_volumen_master_db"):
		am.set_volumen_master_db(linear_to_db(slider_volumen.value))


func _guardar_opciones() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) != OK:
		pass
	cfg.set_value(SECCION, KEY_VOLUMEN, slider_volumen.value)
	cfg.save(CONFIG_PATH)


func _on_volumen_changed(val: float) -> void:
	var am: Node = _get_audio_manager()
	if am != null and am.has_method("set_volumen_master_db"):
		am.set_volumen_master_db(linear_to_db(val))
	_guardar_opciones()


func linear_to_db(linear: float) -> float:
	if linear <= 0.0:
		return -80.0
	return 20.0 * log(linear) / log(10.0)


func _on_jugar_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/main.tscn")


func _on_opciones_pressed() -> void:
	panel_opciones.visible = true


func _on_cerrar_opciones_pressed() -> void:
	panel_opciones.visible = false


func _on_salir_pressed() -> void:
	get_tree().quit()
