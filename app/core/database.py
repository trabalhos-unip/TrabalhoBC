"""Conexão com o banco de dados MySQL.

Database é a única classe do projeto que importa o mysql.connector. Recebe
SQL pronto e parâmetros, executa e devolve o resultado. Não sabe o que é um
livro.
"""

import threading

import mysql.connector
from mysql.connector import pooling

# Mensagem de quando um comando da transação não encontra a linha esperada.
DADOS_MUDARAM = "A operação não foi concluída porque os dados mudaram. Atualize a página e tente de novo."


class ErroBanco(Exception):
    """Falha ao conectar ou ao executar um comando no MySQL."""


class Database:
    """Encapsula a conexão com o MySQL."""

    def __init__(self, host: str, usuario: str, senha: str, banco: str, porta: int = 3306, pool_size: int = 0):
        self.host = host
        self.usuario = usuario
        self.senha = senha
        self.banco = banco
        self.porta = porta
        self.pool_size = pool_size
        self.conexao = None
        self.pool = None
        self._pool_lock = threading.Lock()

    def _abrir_conexao(self):
        """Pega uma conexão pronta do pool, abrindo o pool na primeira vez."""
        if self.pool_size <= 0:
            return mysql.connector.connect(
                host=self.host, port=self.porta, user=self.usuario, password=self.senha, database=self.banco
            )

        if self.pool is None:
            with self._pool_lock:
                if self.pool is None:
                    self.pool = pooling.MySQLConnectionPool(
                        pool_name=f"biblioteca_pool_{id(self)}",
                        pool_size=self.pool_size,
                        pool_reset_session=True,
                        host=self.host,
                        port=self.porta,
                        user=self.usuario,
                        password=self.senha,
                        database=self.banco,
                    )
        conexao = self.pool.get_connection()
        conexao.ping(reconnect=True, attempts=1, delay=0)
        return conexao

    def conectar(self) -> None:
        """Abre a conexão e guarda em self.conexao."""
        try:
            self.conexao = self._abrir_conexao()
        except mysql.connector.Error as erro:
            raise ErroBanco(f"Não foi possível conectar ao MySQL: {erro}") from erro

    def consultar(self, sql: str, params: tuple = ()) -> list[dict]:
        """Executa um SELECT e devolve as linhas como dicionários."""
        conexao = None
        cursor = None
        try:
            conexao = self._abrir_conexao()
            cursor = conexao.cursor(dictionary=True)
            cursor.execute(sql, params)
            return cursor.fetchall()
        except mysql.connector.Error as erro:
            raise ErroBanco(f"Erro ao consultar o banco: {erro}") from erro
        finally:
            if cursor is not None:
                cursor.close()
            if conexao is not None:
                conexao.close()

    def executar(self, sql: str, params: tuple = ()) -> int:
        """Executa INSERT, UPDATE ou DELETE e faz commit.

        Devolve o id gerado (no INSERT) ou o número de linhas afetadas.
        """
        conexao = None
        cursor = None
        try:
            conexao = self._abrir_conexao()
            cursor = conexao.cursor()
            cursor.execute(sql, params)
            conexao.commit()
            return cursor.lastrowid or cursor.rowcount
        except mysql.connector.Error as erro:
            if conexao is not None:
                conexao.rollback()
            raise ErroBanco(f"Erro ao gravar no banco: {erro}") from erro
        finally:
            if cursor is not None:
                cursor.close()
            if conexao is not None:
                conexao.close()

    def executar_transacao(self, comandos: list[tuple[str, tuple]]) -> list[int]:
        """Executa vários comandos numa transação só: ou todos gravam, ou nenhum.

        Cada comando precisa alterar pelo menos uma linha. Se algum não alterar
        (por exemplo, o exemplar já foi emprestado por outra pessoa), tudo é
        desfeito com rollback. Devolve, para cada comando, o id gerado (no
        INSERT) ou o número de linhas afetadas.
        """
        conexao = None
        cursor = None
        try:
            conexao = self._abrir_conexao()
            cursor = conexao.cursor()
            resultados = []
            for sql, params in comandos:
                cursor.execute(sql, params)
                if cursor.rowcount < 1:
                    raise ErroBanco(DADOS_MUDARAM)
                resultados.append(cursor.lastrowid or cursor.rowcount)
            conexao.commit()
            return resultados
        except mysql.connector.Error as erro:
            if conexao is not None:
                conexao.rollback()
            raise ErroBanco(f"Erro ao gravar no banco: {erro}") from erro
        except ErroBanco:
            if conexao is not None:
                conexao.rollback()
            raise
        finally:
            if cursor is not None:
                cursor.close()
            if conexao is not None:
                conexao.close()

    def fechar(self) -> None:
        """Fecha a conexão aberta, se houver."""
        if self.conexao is not None:
            self.conexao.close()
            self.conexao = None
