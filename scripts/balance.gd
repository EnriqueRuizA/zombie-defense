extends Node
## Autoload de balance: constantes de juego para ajustar sin tocar lógica.
## Ajusta aquí oro, vidas, oleada de victoria, cuadrícula, etc.

# Cuadrícula (todo el juego se basa en ella: torres, recorrido, suelo)
const TAMANO_CELDA: float = 2.0
const CELDAS_POR_EJE: int = 25

# Partida
const ORO_INICIAL: int = 100
const VIDAS_INICIALES: int = 20
const ORO_POR_ZOMBIE: int = 5
const TIEMPO_ENTRE_OLEADAS: float = 5.0
const OLEADA_VICTORIA: int = 10

# Oleadas (UI)
const ZOMBIES_BASE_OLEADA: int = 5
const ZOMBIES_INCREMENTO_OLEADA: int = 2
const INTERVALO_SPAWN: float = 2.2

# Zombies
const VIDA_BASE_ZOMBIE: int = 30
const VELOCIDAD_BASE_ZOMBIE: float = 5.0
const FACTOR_VIDA_POR_OLEADA: float = 0.15
const FACTOR_VELOCIDAD_POR_OLEADA: float = 0.06

# Colocación
const DISTANCIA_MINIMA_AL_PATH: float = 3.0
