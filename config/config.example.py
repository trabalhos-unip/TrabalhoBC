"""Configuração de exemplo para a aplicação.

Em produção, cadastre as variáveis de ambiente no provedor. Localmente, estes
fallbacks permitem rodar com `python -m app.main`.
"""

import os


def _inteiro(nome: str, padrao: int) -> int:
    """Lê um inteiro do ambiente, mantendo o padrão se vier vazio."""
    valor = os.getenv(nome)
    return int(valor) if valor else padrao


def _booleano(nome: str, padrao: bool = False) -> bool:
    """Aceita valores comuns de verdadeiro em variáveis de ambiente."""
    valor = os.getenv(nome)
    if valor is None:
        return padrao
    return valor.strip().lower() in ("1", "true", "sim", "yes", "on")

# --- Banco de dados MySQL ---
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = _inteiro("DB_PORT", 3306)
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "biblioteca")

# --- Servidor HTTP local ---
SERVIDOR_HOST = "127.0.0.1"
SERVIDOR_PORTA = 8000

# False: usa o MySQL configurado acima. Execute os scripts em database/ antes de iniciar.
USAR_BANCO_MEMORIA = _booleano("USAR_BANCO_MEMORIA", False)
