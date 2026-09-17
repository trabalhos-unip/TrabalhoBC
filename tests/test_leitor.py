"""Testes do cadastro de leitores.

Os repositórios em memória substituem o banco, então os testes rodam sem MySQL.

Execute a partir da raiz do projeto:

    python -m unittest tests.test_leitor
"""

import unittest
from datetime import date

from pydantic import ValidationError

from app.models.leitor import Leitor
from app.repositories.emprestimo_repository import EmprestimoRepositoryMemoria
from app.repositories.exemplar_repository import ExemplarRepositoryMemoria
from app.repositories.leitor_repository import LeitorRepository, LeitorRepositoryMemoria
from app.repositories.livro_repository import LivroRepositoryMemoria
from app.services.emprestimo_service import EmprestimoService
from app.services.exemplar_service import ExemplarService
from app.services.leitor_service import LeitorService
from app.services.livro_service import LivroService

JOAO = {"nome": "João Silva", "email": "joao@email.com", "telefone": "15999990001"}
MARIA = {"nome": "Maria Santos", "email": "maria@email.com", "telefone": "(15) 99999-0002"}


class DatabaseQueGuardaSQL:
    """Guarda o SQL que o LeitorRepository mandaria ao MySQL."""

    def __init__(self):
        self.sql = None
        self.params = None

    def consultar(self, sql, params=()):
        self.sql, self.params = sql, params
        return []


class TestLeitor(unittest.TestCase):
    """Validações feitas pelo pydantic ao criar um Leitor."""

    def erros(self, dados):
        with self.assertRaises(ValidationError) as contexto:
            Leitor.model_validate(dados)
        return Leitor.mensagens_de_erro(contexto.exception)

    def test_leitor_valido(self):
        leitor = Leitor.model_validate(JOAO)
        self.assertEqual(leitor.nome, "João Silva")
        self.assertEqual(leitor.data_cadastro, date.today())

    def test_email_fica_em_minusculas(self):
        self.assertEqual(Leitor.model_validate({**JOAO, "email": " Joao@Email.COM "}).email, "joao@email.com")

    def test_nome_obrigatorio(self):
        self.assertEqual(self.erros({**JOAO, "nome": "  "}), ["O campo nome é obrigatório."])

    def test_email_invalido(self):
        self.assertEqual(self.erros({**JOAO, "email": "joao.email.com"}),
                         ["O campo e-mail deve ser um endereço válido."])

    def test_telefone_e_obrigatorio(self):
        self.assertEqual(self.erros({**JOAO, "telefone": "  "}), ["O campo telefone é obrigatório."])
        self.assertEqual(self.erros({"nome": "Ana", "email": "ana@email.com"}), ["O campo telefone é obrigatório."])

    def test_telefone_com_letras(self):
        self.assertIn("telefone", self.erros({**JOAO, "telefone": "15 9999-abcd"})[0])

    def test_telefone_com_ddd_fixo_e_celular(self):
        self.assertEqual(Leitor.model_validate({**JOAO, "telefone": "(15) 3333-4444"}).telefone, "(15) 3333-4444")
        self.assertEqual(Leitor.model_validate({**JOAO, "telefone": "15999990001"}).telefone, "15999990001")

    def test_telefone_com_poucos_digitos(self):
        for telefone in ("123", "99999-0001", "(15) 9999-000"):
            with self.subTest(telefone=telefone):
                self.assertEqual(self.erros({**JOAO, "telefone": telefone}),
                                 ["O campo telefone deve ter DDD e número: 10 dígitos (fixo) ou 11 (celular)."])

    def test_telefone_com_digitos_demais(self):
        self.assertIn("10 dígitos (fixo) ou 11", self.erros({**JOAO, "telefone": "(015) 99999-00012"})[0])

    def test_telefone_acima_de_20(self):
        self.assertEqual(self.erros({**JOAO, "telefone": "1" * 21}),
                         ["O campo telefone deve ter no máximo 20 caracteres."])


class TestLeitorService(unittest.TestCase):
    """Regras dos leitores passando pelo service."""

    def setUp(self):
        livros = LivroRepositoryMemoria()
        self.leitores = LeitorRepositoryMemoria()
        exemplares = ExemplarRepositoryMemoria(livros)
        emprestimos = EmprestimoRepositoryMemoria(self.leitores, exemplares)
        self.service = LeitorService(self.leitores, emprestimos)
        self.livro_service = LivroService(livros, exemplares)
        self.exemplar_service = ExemplarService(exemplares, livros, emprestimos)
        self.emprestimo_service = EmprestimoService(emprestimos, self.leitores, exemplares)

    def test_cadastrar_devolve_id_e_data_de_hoje(self):
        ok, leitor = self.service.cadastrar({**JOAO, "id_leitor": 50, "data_cadastro": "2000-01-01"})
        self.assertTrue(ok)
        self.assertEqual(leitor["id_leitor"], 1)
        self.assertEqual(leitor["data_cadastro"], date.today().isoformat())

    def test_cadastrar_sem_telefone_e_recusado(self):
        ok, leitor = self.service.cadastrar({"nome": "Ana Lima", "email": "ana@email.com"})
        self.assertFalse(ok)
        self.assertEqual(leitor, ["O campo telefone é obrigatório."])

    def test_cadastrar_com_telefone_em_branco_e_recusado(self):
        ok, leitor = self.service.cadastrar({"nome": "Ana Lima", "email": "ana@email.com", "telefone": "   "})
        self.assertFalse(ok)
        self.assertEqual(leitor, ["O campo telefone é obrigatório."])

    def test_email_duplicado_e_recusado_sem_diferenciar_maiusculas(self):
        self.service.cadastrar(JOAO)
        ok, erros = self.service.cadastrar({**MARIA, "email": "JOAO@EMAIL.COM"})
        self.assertFalse(ok)
        self.assertEqual(erros, ["Já existe um leitor com esse e-mail."])

    def test_editar_mantem_id_e_data(self):
        self.service.cadastrar(JOAO)
        ok, leitor = self.service.editar(1, {**JOAO, "nome": "João da Silva", "data_cadastro": "2000-01-01"})
        self.assertTrue(ok)
        self.assertEqual(leitor["nome"], "João da Silva")
        self.assertEqual(leitor["data_cadastro"], date.today().isoformat())

    def test_editar_nao_pode_remover_telefone(self):
        self.service.cadastrar(JOAO)
        ok, leitor = self.service.editar(1, {"nome": "João Silva", "email": "joao@email.com", "telefone": ""})
        self.assertFalse(ok)
        self.assertEqual(leitor, ["O campo telefone é obrigatório."])

    def test_editar_mantendo_o_proprio_email(self):
        self.service.cadastrar(JOAO)
        ok, _ = self.service.editar(1, JOAO)
        self.assertTrue(ok)

    def test_editar_para_email_de_outro_leitor(self):
        self.service.cadastrar(JOAO)
        self.service.cadastrar(MARIA)
        ok, erros = self.service.editar(2, {**MARIA, "email": JOAO["email"]})
        self.assertFalse(ok)
        self.assertEqual(erros, ["Já existe um leitor com esse e-mail."])

    def test_editar_leitor_que_nao_existe(self):
        self.assertEqual(self.service.editar(99, JOAO), (False, ["Leitor não encontrado."]))

    def test_remover_leitor_sem_emprestimos(self):
        self.service.cadastrar(JOAO)
        ok, leitor = self.service.remover(1)
        self.assertTrue(ok)
        self.assertEqual(leitor["nome"], "João Silva")
        self.assertEqual(self.service.listar({}), [])

    def test_remover_leitor_com_emprestimo_e_recusado(self):
        self.service.cadastrar(JOAO)
        self.livro_service.cadastrar({"titulo": "1984", "autor": "George Orwell", "genero": "Ficção",
                                      "ano_lancamento": 1949, "resumo": "Distopia."})
        self.exemplar_service.cadastrar({"id_livro": 1})
        self.emprestimo_service.registrar({"id_leitor": 1, "id_exemplar": 1,
                                           "data_emprestimo": date.today().isoformat(), "prazo_dias": 7})
        ok, erros = self.service.remover(1)
        self.assertFalse(ok)
        self.assertEqual(erros, ["Este leitor tem empréstimos registrados e não pode ser excluído."])

    def test_listar_em_ordem_de_nome_e_com_busca(self):
        self.service.cadastrar(MARIA)
        self.service.cadastrar(JOAO)
        self.assertEqual([leitor["nome"] for leitor in self.service.listar({})], ["João Silva", "Maria Santos"])
        self.assertEqual([leitor["nome"] for leitor in self.service.listar({"busca": "joao"})], ["João Silva"])
        self.assertEqual([leitor["nome"] for leitor in self.service.listar({"busca": "maria@"})], ["Maria Santos"])


class TestSQLDoLeitorRepository(unittest.TestCase):
    """O texto do usuário vai sempre como parâmetro."""

    def setUp(self):
        self.database = DatabaseQueGuardaSQL()
        self.repositorio = LeitorRepository(self.database)

    def test_busca_vira_like_com_parametros(self):
        self.repositorio.listar(busca="jo%")
        self.assertIn("(nome LIKE %s OR email LIKE %s)", self.database.sql)
        self.assertEqual(self.database.params, (r"%jo\%%", r"%jo\%%"))

    def test_email_unico_ignora_o_proprio_leitor(self):
        self.repositorio.existe_email("joao@email.com", ignorar_id=3)
        self.assertIn("id_leitor <> %s", self.database.sql)
        self.assertEqual(self.database.params, ("joao@email.com", 3))


if __name__ == "__main__":
    unittest.main()
