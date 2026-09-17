"""Testes dos empréstimos, das devoluções e da disponibilidade.

Os repositórios em memória substituem o banco, então os testes rodam sem MySQL.
A transação do Database é testada com uma conexão falsa.

Execute a partir da raiz do projeto:

    python -m unittest tests.test_emprestimo
"""

import unittest
from datetime import date, timedelta
from unittest import mock

from pydantic import ValidationError

from app.core.database import Database, ErroBanco
from app.models.emprestimo import Emprestimo
from app.repositories.emprestimo_repository import EmprestimoRepository, EmprestimoRepositoryMemoria
from app.repositories.exemplar_repository import ExemplarRepositoryMemoria
from app.repositories.leitor_repository import LeitorRepositoryMemoria
from app.repositories.livro_repository import LivroRepositoryMemoria
from app.services.emprestimo_service import EmprestimoService
from app.services.exemplar_service import ExemplarService
from app.services.leitor_service import LeitorService
from app.services.livro_service import LivroService

HOJE = date.today().isoformat()
VALIDO = {"id_leitor": 1, "id_exemplar": 1, "data_emprestimo": HOJE, "prazo_dias": 7}


class TestEmprestimo(unittest.TestCase):
    """Validações feitas pelo pydantic ao criar um Emprestimo."""

    def erros(self, dados):
        with self.assertRaises(ValidationError) as contexto:
            Emprestimo.model_validate(dados)
        return Emprestimo.mensagens_de_erro(contexto.exception)

    def test_campos_obrigatorios(self):
        self.assertEqual(self.erros({"id_leitor": "", "data_emprestimo": "", "prazo_dias": ""}), [
            "O campo leitor é obrigatório.",
            "O campo exemplar é obrigatório.",
            "O campo data do empréstimo é obrigatório.",
            "O campo prazo de devolução é obrigatório.",
        ])

    def test_data_futura_e_recusada(self):
        amanha = (date.today() + timedelta(days=1)).isoformat()
        self.assertEqual(self.erros({**VALIDO, "data_emprestimo": amanha}),
                         ["A data do empréstimo não pode ser futura."])

    def test_data_invalida(self):
        self.assertEqual(self.erros({**VALIDO, "data_emprestimo": "ontem"}),
                         ["O campo data do empréstimo deve ser uma data válida."])

    def test_prazo_fora_do_intervalo(self):
        for prazo in (0, 366, -3):
            with self.subTest(prazo=prazo):
                self.assertEqual(self.erros({**VALIDO, "prazo_dias": prazo}),
                                 ["O prazo de devolução deve ser de 1 a 365 dias."])

    def test_prazo_nao_numerico(self):
        self.assertEqual(self.erros({**VALIDO, "prazo_dias": "uma semana"}),
                         ["O campo prazo de devolução deve ser um número inteiro."])

    def test_prazo_nao_aparece_na_resposta(self):
        self.assertNotIn("prazo_dias", Emprestimo.model_validate(VALIDO).model_dump())

    def test_situacao_sai_da_data_de_devolucao(self):
        emprestimo = Emprestimo.model_validate(VALIDO)
        self.assertEqual(emprestimo.model_dump()["situacao"], "ATIVO")
        devolvido = emprestimo.model_copy(update={"data_devolucao": date.today()})
        self.assertEqual(devolvido.model_dump()["situacao"], "DEVOLVIDO")


class TestEmprestimoService(unittest.TestCase):
    """Empréstimo, devolução e regras de disponibilidade."""

    def setUp(self):
        livros = LivroRepositoryMemoria()
        leitores = LeitorRepositoryMemoria()
        exemplares = ExemplarRepositoryMemoria(livros)
        emprestimos = EmprestimoRepositoryMemoria(leitores, exemplares)
        self.service = EmprestimoService(emprestimos, leitores, exemplares)
        self.exemplar_service = ExemplarService(exemplares, livros, emprestimos)

        LivroService(livros, exemplares).cadastrar({
            "titulo": "Dom Casmurro", "autor": "Machado de Assis", "genero": "Romance",
            "ano_lancamento": 1899, "resumo": "Bentinho relembra Capitu.",
        })
        leitor_service = LeitorService(leitores, emprestimos)
        leitor_service.cadastrar({"nome": "João Silva", "email": "joao@email.com"})
        leitor_service.cadastrar({"nome": "Maria Santos", "email": "maria@email.com"})
        self.exemplar_service.cadastrar({"id_livro": 1})
        self.exemplar_service.cadastrar({"id_livro": 1})

    def emprestar(self, id_leitor=1, id_exemplar=1, **extra):
        return self.service.registrar({**VALIDO, "id_leitor": id_leitor, "id_exemplar": id_exemplar, **extra})

    def status_do_exemplar(self, id_exemplar):
        return next(exemplar["status"] for exemplar in self.exemplar_service.listar({})
                    if exemplar["id_exemplar"] == id_exemplar)

    def test_registrar_emprestimo(self):
        ok, emprestimo = self.emprestar()
        self.assertTrue(ok)
        self.assertEqual(emprestimo["situacao"], "ATIVO")
        self.assertEqual(emprestimo["nome_leitor"], "João Silva")
        self.assertEqual(emprestimo["titulo_livro"], "Dom Casmurro")
        self.assertEqual(self.status_do_exemplar(1), "EMPRESTADO")

    def test_data_prevista_sai_do_prazo(self):
        ok, emprestimo = self.emprestar(prazo_dias="14")
        self.assertTrue(ok)
        self.assertEqual(emprestimo["data_prevista_devolucao"], (date.today() + timedelta(days=14)).isoformat())
        self.assertNotIn("prazo_dias", emprestimo)

    def test_data_prevista_nao_vem_da_tela(self):
        ok, emprestimo = self.emprestar(prazo_dias=7, data_prevista_devolucao="2000-01-01")
        self.assertTrue(ok)
        self.assertEqual(emprestimo["data_prevista_devolucao"], (date.today() + timedelta(days=7)).isoformat())

    def test_ordena_pela_devolucao_prevista(self):
        self.emprestar(id_leitor=1, id_exemplar=1, prazo_dias=30)
        self.emprestar(id_leitor=2, id_exemplar=2, prazo_dias=3)
        proxima = [item["nome_leitor"] for item in self.service.listar({"ordem": "devolucao-proxima"})]
        distante = [item["nome_leitor"] for item in self.service.listar({"ordem": "devolucao-distante"})]
        self.assertEqual(proxima, ["Maria Santos", "João Silva"])
        self.assertEqual(distante, ["João Silva", "Maria Santos"])

    def test_ordem_desconhecida_usa_a_padrao(self):
        self.emprestar(id_leitor=1, id_exemplar=1)
        self.emprestar(id_leitor=2, id_exemplar=2)
        self.assertEqual([item["id_emprestimo"] for item in self.service.listar({"ordem": "xpto"})], [2, 1])

    def test_id_e_devolucao_nao_vem_da_tela(self):
        ok, emprestimo = self.emprestar(id_emprestimo=99, data_devolucao=HOJE)
        self.assertTrue(ok)
        self.assertEqual(emprestimo["id_emprestimo"], 1)
        self.assertIsNone(emprestimo["data_devolucao"])

    def test_leitor_que_nao_existe(self):
        self.assertEqual(self.emprestar(id_leitor=99), (False, ["O leitor selecionado não existe."]))

    def test_exemplar_que_nao_existe(self):
        self.assertEqual(self.emprestar(id_exemplar=99), (False, ["O exemplar selecionado não existe."]))

    def test_exemplar_emprestado_nao_pode_ser_emprestado_de_novo(self):
        self.emprestar()
        ok, erros = self.emprestar(id_leitor=2)
        self.assertFalse(ok)
        self.assertEqual(erros, ["O exemplar selecionado não está disponível para empréstimo."])

    def test_registrar_devolucao(self):
        self.emprestar()
        ok, emprestimo = self.service.registrar_devolucao(1)
        self.assertTrue(ok)
        self.assertEqual(emprestimo["situacao"], "DEVOLVIDO")
        self.assertEqual(emprestimo["data_devolucao"], HOJE)
        self.assertEqual(self.status_do_exemplar(1), "DISPONIVEL")

    def test_depois_da_devolucao_o_exemplar_pode_ser_emprestado_de_novo(self):
        self.emprestar()
        self.service.registrar_devolucao(1)
        ok, _ = self.emprestar(id_leitor=2)
        self.assertTrue(ok)

    def test_devolver_duas_vezes(self):
        self.emprestar()
        self.service.registrar_devolucao(1)
        self.assertEqual(self.service.registrar_devolucao(1), (False, ["Este empréstimo já foi devolvido."]))

    def test_devolver_emprestimo_que_nao_existe(self):
        self.assertEqual(self.service.registrar_devolucao(99), (False, ["Empréstimo não encontrado."]))

    def test_listar_ativos_devolvidos_e_busca(self):
        self.emprestar(id_leitor=1, id_exemplar=1)
        self.emprestar(id_leitor=2, id_exemplar=2)
        self.service.registrar_devolucao(1)
        self.assertEqual([item["nome_leitor"] for item in self.service.listar({"situacao": "ativo"})],
                         ["Maria Santos"])
        self.assertEqual([item["nome_leitor"] for item in self.service.listar({"situacao": "DEVOLVIDO"})],
                         ["João Silva"])
        self.assertEqual(len(self.service.listar({"busca": "casmurro"})), 2)
        self.assertEqual([item["nome_leitor"] for item in self.service.listar({"busca": "joao"})], ["João Silva"])


class DatabaseQueGuardaTransacao:
    """Guarda os comandos que o EmprestimoRepository mandaria numa transação."""

    def __init__(self):
        self.comandos = None

    def executar_transacao(self, comandos):
        self.comandos = comandos
        return [7, 1]


class TestSQLDoEmprestimoRepository(unittest.TestCase):
    """Empréstimo e devolução mexem em duas tabelas numa transação só."""

    def setUp(self):
        self.database = DatabaseQueGuardaTransacao()
        self.repositorio = EmprestimoRepository(self.database)
        self.prevista = date.today() + timedelta(days=7)
        self.emprestimo = Emprestimo.model_validate(
            {**VALIDO, "id_exemplar": 3}
        ).model_copy(update={"data_prevista_devolucao": self.prevista})

    def test_registrar_insere_e_marca_emprestado_na_mesma_transacao(self):
        criado = self.repositorio.registrar(self.emprestimo)
        (sql_insert, params_insert), (sql_update, params_update) = self.database.comandos
        self.assertTrue(sql_insert.startswith("INSERT INTO emprestimos"))
        self.assertIn("data_prevista_devolucao", sql_insert)
        self.assertEqual(params_insert, (1, 3, date.today(), self.prevista))
        self.assertIn("UPDATE exemplares SET status = %s WHERE id_exemplar = %s AND status = %s", sql_update)
        self.assertEqual(params_update, ("EMPRESTADO", 3, "DISPONIVEL"))
        self.assertEqual(criado.id_emprestimo, 7)

    def test_devolucao_grava_data_e_libera_exemplar_na_mesma_transacao(self):
        emprestimo = self.emprestimo.model_copy(update={"id_emprestimo": 7})
        self.repositorio.registrar_devolucao(emprestimo, date.today())
        (sql_emprestimo, params_emprestimo), (sql_exemplar, params_exemplar) = self.database.comandos
        self.assertIn("SET data_devolucao = %s WHERE id_emprestimo = %s AND data_devolucao IS NULL", sql_emprestimo)
        self.assertEqual(params_emprestimo, (date.today(), 7))
        self.assertEqual(params_exemplar, ("DISPONIVEL", 3, "EMPRESTADO"))


class CursorFalso:
    """Imita o cursor do mysql-connector: o UPDATE não altera linha nenhuma."""

    def __init__(self):
        self.lastrowid = 0
        self.rowcount = 0
        self.fechado = False

    def execute(self, sql, params=()):
        comando = sql.split()[0].upper()
        self.lastrowid = 10 if comando == "INSERT" else 0
        self.rowcount = 1 if comando == "INSERT" else 0

    def close(self):
        self.fechado = True


class ConexaoFalsa:
    def __init__(self):
        self.commits = 0
        self.rollbacks = 0
        self.fechada = False

    def cursor(self):
        return CursorFalso()

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.fechada = True


class TestTransacaoDoDatabase(unittest.TestCase):
    """Se um comando não altera a linha esperada, nada é gravado."""

    def test_conecta_na_porta_configurada(self):
        conexao = ConexaoFalsa()
        with mock.patch("app.core.database.mysql.connector.connect", return_value=conexao) as conectar:
            banco = Database("host", "usuario", "senha", "banco", porta=3307)
            banco.conectar()

        conectar.assert_called_once_with(
            host="host", port=3307, user="usuario", password="senha", database="banco"
        )
        banco.fechar()

    def test_rollback_quando_o_exemplar_ja_foi_emprestado(self):
        conexao = ConexaoFalsa()
        with mock.patch("app.core.database.mysql.connector.connect", return_value=conexao):
            with self.assertRaises(ErroBanco):
                Database("host", "usuario", "senha", "banco").executar_transacao([
                    ("INSERT INTO emprestimos (id_leitor) VALUES (%s)", (1,)),
                    ("UPDATE exemplares SET status = %s WHERE id_exemplar = %s", ("EMPRESTADO", 1)),
                ])
        self.assertEqual(conexao.commits, 0)
        self.assertEqual(conexao.rollbacks, 1)
        self.assertTrue(conexao.fechada)


if __name__ == "__main__":
    unittest.main()
