"""Despacho das rotas JSON da API.

Esta classe não sabe se a requisição veio do HTTPServer local ou de uma
função WSGI na Vercel. Ela só traduz método/caminho/corpo em chamada de
service e devolve status HTTP com dados serializáveis.
"""

import json
from urllib.parse import parse_qsl

from app.core.database import ErroBanco
from app.services.emprestimo_service import NAO_ENCONTRADO as EMPRESTIMO_NAO_ENCONTRADO
from app.services.exemplar_service import NAO_ENCONTRADO as EXEMPLAR_NAO_ENCONTRADO
from app.services.leitor_service import NAO_ENCONTRADO as LEITOR_NAO_ENCONTRADO
from app.services.livro_service import NAO_ENCONTRADO as LIVRO_NAO_ENCONTRADO

PREFIXO_API = "/api/"

# Recursos que têm cadastrar, editar e excluir.
RECURSOS_CRUD = ("livros", "leitores", "exemplares")

# Mensagens dos services que viram 404 em vez de 400.
NAO_ENCONTRADOS = {
    LIVRO_NAO_ENCONTRADO,
    LEITOR_NAO_ENCONTRADO,
    EXEMPLAR_NAO_ENCONTRADO,
    EMPRESTIMO_NAO_ENCONTRADO,
}


class AplicacaoAPI:
    """Executa as rotas da API usando os services já montados."""

    def __init__(self, livro_service, leitor_service, exemplar_service, emprestimo_service):
        self.livro_service = livro_service
        self.leitor_service = leitor_service
        self.exemplar_service = exemplar_service
        self.emprestimo_service = emprestimo_service

    def atender(self, metodo: str, caminho: str, query_string: str = "", corpo: bytes = b"") -> tuple[int, object]:
        """Despacha a requisição da API e devolve (status, dados)."""
        rota = self._rota(caminho)
        if rota is None:
            return self._nao_encontrado()

        metodo = metodo.upper()
        if metodo == "GET":
            return self._get(rota, query_string)
        if metodo == "POST":
            return self._post(rota, corpo)
        if metodo == "PUT":
            return self._put(rota, corpo)
        if metodo == "DELETE":
            return self._delete(rota)
        return 405, {"erro": "Método não permitido."}

    def _get(self, rota, query_string: str) -> tuple[int, object]:
        recurso, id_registro, acao = rota
        service = self._service(recurso)
        filtros = dict(parse_qsl(query_string))

        if service is None or id_registro is not None:
            return self._nao_encontrado()
        if acao is None:
            return self._executar(lambda: (True, service.listar(filtros)))
        if recurso == "livros" and acao == "filtros":
            return self._executar(lambda: (True, service.opcoes_de_filtro()))
        return self._nao_encontrado()

    def _post(self, rota, corpo: bytes) -> tuple[int, object]:
        recurso, id_registro, acao_rota = rota
        service = self._service(recurso)
        if service is None or id_registro is not None or acao_rota is not None:
            return self._nao_encontrado()

        acao = service.registrar if recurso == "emprestimos" else service.cadastrar
        return self._executar(lambda: acao(self._ler_corpo(corpo)), status_ok=201)

    def _put(self, rota, corpo: bytes) -> tuple[int, object]:
        recurso, id_registro, acao = rota
        if id_registro is None:
            return self._nao_encontrado()

        if recurso in RECURSOS_CRUD and acao is None:
            service = self._service(recurso)
            return self._executar(lambda: service.editar(id_registro, self._ler_corpo(corpo)))
        if recurso == "emprestimos" and acao == "devolucao":
            return self._executar(lambda: self.emprestimo_service.registrar_devolucao(id_registro))
        return self._nao_encontrado()

    def _delete(self, rota) -> tuple[int, object]:
        recurso, id_registro, acao = rota
        if recurso not in RECURSOS_CRUD or id_registro is None or acao is not None:
            return self._nao_encontrado()

        service = self._service(recurso)
        return self._executar(lambda: service.remover(id_registro))

    def _service(self, recurso: str):
        """Devolve o service do recurso da URL, ou None se o recurso não existir."""
        return {
            "livros": self.livro_service,
            "leitores": self.leitor_service,
            "exemplares": self.exemplar_service,
            "emprestimos": self.emprestimo_service,
        }.get(recurso)

    def _rota(self, caminho: str) -> tuple[str, int | None, str | None] | None:
        """Quebra /api/{recurso}/{id}/{acao} em (recurso, id, acao)."""
        if not caminho.startswith(PREFIXO_API):
            return None

        partes = [parte for parte in caminho[len(PREFIXO_API):].split("/") if parte]
        if not partes:
            return "", None, None

        recurso, resto = partes[0], partes[1:]
        if not resto:
            return recurso, None, None
        if resto[0].isdigit() and len(resto) <= 2:
            return recurso, int(resto[0]), resto[1] if len(resto) == 2 else None
        if len(resto) == 1:
            return recurso, None, resto[0]
        return "", None, None

    def _executar(self, acao, status_ok: int = 200) -> tuple[int, object]:
        """Chama o service e traduz o resultado em resposta HTTP."""
        try:
            ok, resultado = acao()
        except json.JSONDecodeError:
            return 400, {"erro": "O corpo enviado não é um JSON válido."}
        except ErroBanco as erro:
            return 503, {"erro": str(erro)}

        if ok:
            return status_ok, resultado

        status = 404 if resultado and resultado[0] in NAO_ENCONTRADOS else 400
        return status, {"erro": " ".join(resultado)}

    def _nao_encontrado(self) -> tuple[int, dict]:
        """Resposta padrão para rota da API que não existe."""
        return 404, {"erro": "Rota não encontrada."}

    def _ler_corpo(self, corpo: bytes) -> dict:
        """Converte o corpo JSON em dicionário."""
        dados = json.loads(corpo or b"{}")
        if not isinstance(dados, dict):
            raise json.JSONDecodeError("O corpo deve ser um objeto JSON.", "", 0)
        return dados
