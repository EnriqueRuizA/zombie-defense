extends Node
## Sonido opcional: reproduce efectos si existen en assets/sfx/.
## Si no hay archivos, las llamadas no hacen nada (sin errores ni WASAPI).

const PATH_UI_CLICK: String = "res://assets/sfx/click.wav"
const PATH_BUILD: String = "res://assets/sfx/build.wav"
const PATH_SAVE: String = "res://assets/sfx/save.wav"
const PATH_DAY: String = "res://assets/sfx/day.wav"

var _player: AudioStreamPlayer


func _ready() -> void:
	_player = AudioStreamPlayer.new()
	add_child(_player)


func _play_path(path: String) -> void:
	if path.is_empty():
		return
	var stream: AudioStream = load(path) as AudioStream
	if stream == null:
		return
	_player.stream = stream
	_player.play()


func play_ui_click() -> void:
	_play_path(PATH_UI_CLICK)


func play_build() -> void:
	_play_path(PATH_BUILD)


func play_save() -> void:
	_play_path(PATH_SAVE)


func play_day_change() -> void:
	_play_path(PATH_DAY)
