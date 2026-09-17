"""Ponto de entrada do sistema.

Monta a cadeia de dependências uma única vez e expõe a aplicação WSGI:

    Database → Repositories → Services → API → WSGI/Servidor

Execute a partir da raiz do projeto:

    python -m app.main
"""

from http.server import ThreadingHTTPServer

from app.core.api import AplicacaoAPI
from app.core.database import Database
from app.core.servidor import Servidor
from app.core.wsgi import AplicacaoWSGI
from app.repositories.emprestimo_repository import EmprestimoRepository, EmprestimoRepositoryMemoria
from app.repositories.exemplar_repository import ExemplarRepository, ExemplarRepositoryMemoria
from app.repositories.leitor_repository import LeitorRepository, LeitorRepositoryMemoria
from app.repositories.livro_repository import LivroRepository, LivroRepositoryMemoria
from app.services.emprestimo_service import EmprestimoService
from app.services.exemplar_service import ExemplarService
from app.services.leitor_service import LeitorService
from app.services.livro_service import LivroService
from config import settings as config

# Dados de exemplo do modo em memória: os mesmos do DML do documento de banco de dados.
LIVROS_DE_EXEMPLO = [
    {"titulo": "Dom Casmurro", "autor": "Machado de Assis", "genero": "Romance", "ano_lancamento": 1899,
     "resumo": "Romance brasileiro narrado por Bentinho, que relembra sua história e seu "
               "relacionamento com Capitu."},
    {"titulo": "1984", "autor": "George Orwell", "genero": "Ficção", "ano_lancamento": 1949,
     "resumo": "Romance distópico que apresenta uma sociedade controlada por um regime totalitário."},
    {"titulo": "O Pequeno Príncipe", "autor": "Antoine de Saint-Exupéry", "genero": "Fantasia",
     "ano_lancamento": 1943,
     "resumo": "Uma história sobre amizade, relações humanas e a maneira como enxergamos o mundo."},
]

LEITORES_DE_EXEMPLO = [
    {"nome": "João Silva", "email": "joao@email.com", "telefone": "15999990001"},
    {"nome": "Maria Santos", "email": "maria@email.com", "telefone": "15999990002"},
]

# Todos começam disponíveis, como no DML.
EXEMPLARES_DE_EXEMPLO = [{"id_livro": 1}, {"id_livro": 1}, {"id_livro": 2}, {"id_livro": 3}]


def montar_repositorios():
    """Escolhe entre o MySQL e a memória, conforme config.USAR_BANCO_MEMORIA."""
    if config.USAR_BANCO_MEMORIA:
        livros = LivroRepositoryMemoria()
        leitores = LeitorRepositoryMemoria()
        exemplares = ExemplarRepositoryMemoria(livros)
        emprestimos = EmprestimoRepositoryMemoria(leitores, exemplares)
    else:
        db = Database(config.DB_HOST, config.DB_USER, config.DB_PASSWORD, config.DB_NAME, config.DB_PORT, pool_size=2)
        livros = LivroRepository(db)
        leitores = LeitorRepository(db)
        exemplares = ExemplarRepository(db)
        emprestimos = EmprestimoRepository(db)
    return livros, leitores, exemplares, emprestimos


def carregar_dados_de_exemplo(api: AplicacaoAPI):
    """Preenche o modo em memória passando pelos services, com as mesmas validações."""
    for dados in LIVROS_DE_EXEMPLO:
        api.livro_service.cadastrar(dados)
    for dados in LEITORES_DE_EXEMPLO:
        api.leitor_service.cadastrar(dados)
    for dados in EXEMPLARES_DE_EXEMPLO:
        api.exemplar_service.cadastrar(dados)


def montar_api() -> AplicacaoAPI:
    """Monta repositórios e services e devolve a aplicação da API."""
    livros, leitores, exemplares, emprestimos = montar_repositorios()

    api = AplicacaoAPI(
        LivroService(livros, exemplares),
        LeitorService(leitores, emprestimos),
        ExemplarService(exemplares, livros, emprestimos),
        EmprestimoService(emprestimos, leitores, exemplares),
    )

    if config.USAR_BANCO_MEMORIA:
        carregar_dados_de_exemplo(api)

    return api


def criar_wsgi_app() -> AplicacaoWSGI:
    """Cria a aplicação WSGI usada pela Vercel."""
    return AplicacaoWSGI(montar_api())


class WSGILazy:
    """Atrasa a montagem da API até a primeira requisição WSGI."""

    def __init__(self):
        self._app = None

    def __call__(self, environ, start_response):
        if self._app is None:
            self._app = criar_wsgi_app()
        return self._app(environ, start_response)


app = WSGILazy()
application = app
handler = app


def principal():
    """Monta repositórios -> services -> Servidor e sobe o servidor local."""
    Servidor.api = montar_api()

    if config.USAR_BANCO_MEMORIA:
        print("Modo em memória: começa com dados de exemplo; os cadastros somem ao reiniciar.")

    servidor = ThreadingHTTPServer((config.SERVIDOR_HOST, config.SERVIDOR_PORTA), Servidor)
    print(f"Servidor no ar em http://{config.SERVIDOR_HOST}:{config.SERVIDOR_PORTA}")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando o servidor.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    principal()
