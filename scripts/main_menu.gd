extends Control
## FASE 1: Menú principal del prototipo.

@onready var new_game_btn: Button = $VBox/Buttons/NewGameBtn
@onready var load_btn: Button = $VBox/Buttons/LoadBtn
@onready var quit_btn: Button = $VBox/Buttons/QuitBtn
@onready var beep_player: AudioStreamPlayer = $BeepPlayer
@onready var load_dialog: AcceptDialog = $LoadDialog

const BEEP_HZ: float = 440.0
const BEEP_SECONDS: float = 0.10
const BEEP_GAIN: float = 0.20
const BEEP_SR: float = 44100.0


func _ready() -> void:
	# Beep desactivado por defecto para evitar errores WASAPI en algunos Windows.
	# Para reactivar: descomenta las 3 líneas siguientes.
	# var gen := AudioStreamGenerator.new()
	# gen.mix_rate = BEEP_SR
	# beep_player.stream = gen
	new_game_btn.pressed.connect(_on_new_game_pressed)
	load_btn.pressed.connect(_on_load_pressed)
	quit_btn.pressed.connect(_on_quit_pressed)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		get_tree().quit()


func _on_new_game_pressed() -> void:
	_play_beep()
	_try_sound_click()
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null and gm.has_method("reset_for_new_game"):
		gm.reset_for_new_game()
	get_tree().change_scene_to_file("res://scenes/city.tscn")


func _on_load_pressed() -> void:
	_play_beep()
	_try_sound_click()
	var gm: Node = get_node_or_null("/root/GameManager")
	if gm != null and gm.has_method("load_game") and gm.has_method("apply_loaded_state"):
		var data: Dictionary = gm.load_game()
		if not data.is_empty() and gm.apply_loaded_state(data):
			get_tree().change_scene_to_file("res://scenes/city.tscn")
			return
	load_dialog.dialog_text = "No hay partida guardada."
	load_dialog.popup_centered()


func _on_quit_pressed() -> void:
	_play_beep()
	_try_sound_click()
	get_tree().quit()


func _try_sound_click() -> void:
	var sm: Node = get_node_or_null("/root/SoundManager")
	if sm != null and sm.has_method("play_ui_click"):
		sm.play_ui_click()


func _play_beep() -> void:
	if beep_player.stream == null:
		return
	beep_player.play()
	var playback := beep_player.get_stream_playback()
	if playback == null or not (playback is AudioStreamGeneratorPlayback):
		return

	var gen := playback as AudioStreamGeneratorPlayback
	var frames := int(BEEP_SR * BEEP_SECONDS)
	if frames <= 0:
		return
	if not gen.can_push_buffer(frames):
		return

	for i in frames:
		var t := float(i) / BEEP_SR
		var s := sin(TAU * BEEP_HZ * t) * BEEP_GAIN
		gen.push_frame(Vector2(s, s))
