"""Servidor HTTP local do projeto.

Entrega os arquivos do front-end e repassa as chamadas /api/* para a mesma
aplicação usada pela WSGI na Vercel.
"""

import json
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

PASTA_FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
PREFIXO_API = "/api/"


class Servidor(SimpleHTTPRequestHandler):
    """Recebe as requisições HTTP e devolve JSON ou arquivos do front-end."""

    # AplicacaoAPI definida no main.py.
    api = None
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PASTA_FRONTEND), **kwargs)

    def do_GET(self):
        """Listagens da API e arquivos do front-end."""
        if not self._e_api():
            self._servir_estatico()
            return

        self._responder_api()

    def do_POST(self):
        """Cadastra um livro, leitor ou exemplar, ou registra um empréstimo."""
        self._responder_api()

    def do_PUT(self):
        """Edita um livro, leitor ou exemplar, ou registra a devolução de um empréstimo."""
        self._responder_api()

    def do_DELETE(self):
        """Exclui um livro, leitor ou exemplar."""
        self._responder_api()

    def end_headers(self):
        """Faz o navegador sempre conferir se o arquivo mudou (sem cache velho)."""
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _responder_api(self) -> None:
        """Chama a AplicacaoAPI e envia o resultado como JSON."""
        if self.api is None:
            self._responder(503, {"erro": "Servidor não configurado."})
            return

        partes = urlsplit(self.path)
        status, dados = self.api.atender(self.command, partes.path, partes.query, self._ler_corpo_bruto())
        self._responder(status, dados)

    def _e_api(self) -> bool:
        """Diz se a requisição deve ser tratada pela API."""
        return urlsplit(self.path).path.startswith(PREFIXO_API)

    def _ler_corpo_bruto(self) -> bytes:
        """Lê o corpo da requisição sem interpretar o JSON."""
        tamanho = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(tamanho) if tamanho else b""

    def _responder(self, status: int, dados) -> None:
        """Envia o status, os headers e os dados em JSON."""
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _servir_estatico(self) -> None:
        """Entrega os arquivos HTML, CSS e JS da pasta frontend/."""
        super().do_GET()
