"""Adaptador WSGI para executar a API em funções Python."""

import json
from http import HTTPStatus
from urllib.parse import urlsplit


class AplicacaoWSGI:
    """Callable WSGI que expõe a AplicacaoAPI."""

    def __init__(self, api):
        self.api = api

    def __call__(self, environ, start_response):
        metodo = environ.get("REQUEST_METHOD", "GET")
        query_string = environ.get("QUERY_STRING", "")
        caminho, query_string = self._caminho_original(environ, query_string)
        corpo = self._ler_corpo(environ)

        status, dados = self.api.atender(metodo, caminho, query_string, corpo)
        resposta = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        frase = HTTPStatus(status).phrase

        start_response(f"{status} {frase}", [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Content-Length", str(len(resposta))),
            ("Cache-Control", "no-cache"),
        ])
        return [resposta]

    def _ler_corpo(self, environ) -> bytes:
        tamanho = environ.get("CONTENT_LENGTH") or "0"
        try:
            tamanho = int(tamanho)
        except ValueError:
            tamanho = 0
        return environ["wsgi.input"].read(tamanho) if tamanho else b""

    def _caminho_original(self, environ, query_string: str) -> tuple[str, str]:
        """Usa o caminho original se a plataforma expuser só o destino do rewrite."""
        caminho = environ.get("PATH_INFO") or "/"
        if caminho != "/api/index.py":
            return caminho, query_string

        uri = environ.get("REQUEST_URI") or environ.get("RAW_URI")
        if not uri:
            return caminho, query_string

        partes = urlsplit(uri)
        return partes.path, partes.query or query_string
