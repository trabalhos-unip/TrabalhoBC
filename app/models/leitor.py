"""Entidade Leitor, validada pelo pydantic.

Ao criar um Leitor, o pydantic confere os campos. Se algum estiver inválido,
levanta ValidationError e o objeto não é criado.
"""

import re
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from pydantic_core import PydanticCustomError

# Nome de cada campo como aparece para o usuário.
ROTULOS = {
    "nome": "nome",
    "email": "e-mail",
    "telefone": "telefone",
    "data_cadastro": "data de cadastro",
}

# Mensagens em português para os erros do pydantic.
MENSAGENS = {
    "missing": "O campo {campo} é obrigatório.",
    "string_too_short": "O campo {campo} é obrigatório.",
    "string_too_long": "O campo {campo} deve ter no máximo {max_length} caracteres.",
    "string_type": "O campo {campo} deve ser um texto.",
}

FORMATO_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
FORMATO_TELEFONE = re.compile(r"^[0-9()+\-\s]+$")
# DDD + número: fixo tem 10 dígitos, celular tem 11.
DIGITOS_TELEFONE = (10, 11)


class Leitor(BaseModel):
    """Um leitor cadastrado na biblioteca."""

    model_config = ConfigDict(str_strip_whitespace=True)

    id_leitor: int | None = None
    nome: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=1, max_length=150)
    telefone: str = Field(min_length=1, max_length=20)
    data_cadastro: date = Field(default_factory=date.today)

    @field_validator("email")
    @classmethod
    def validar_email(cls, email: str) -> str:
        """Confere o formato e guarda em minúsculas, para o e-mail único valer sempre."""
        if not FORMATO_EMAIL.match(email):
            raise PydanticCustomError("email_invalido", "O campo e-mail deve ser um endereço válido.")
        return email.lower()

    @field_validator("telefone", mode="before")
    @classmethod
    def telefone_em_branco(cls, telefone):
        """Telefone é obrigatório: em branco vira string vazia para cair na validação."""
        if telefone is None or str(telefone).strip() == "":
            return ""
        return telefone

    @field_validator("telefone")
    @classmethod
    def validar_telefone(cls, telefone: str) -> str:
        """Aceita só números e símbolos de telefone, com DDD: 10 dígitos (fixo) ou 11 (celular)."""
        if not FORMATO_TELEFONE.match(telefone):
            raise PydanticCustomError(
                "telefone_invalido",
                "O campo telefone deve ter só números, espaços, parênteses, + e -.",
            )
        if len(re.sub(r"\D", "", telefone)) not in DIGITOS_TELEFONE:
            raise PydanticCustomError(
                "telefone_incompleto",
                "O campo telefone deve ter DDD e número: 10 dígitos (fixo) ou 11 (celular).",
            )
        return telefone

    @staticmethod
    def mensagens_de_erro(erro: ValidationError) -> list[str]:
        """Traduz os erros do pydantic em mensagens para o usuário."""
        mensagens = []
        for item in erro.errors():
            campo = ROTULOS.get(item["loc"][0], item["loc"][0]) if item["loc"] else "leitor"
            modelo = MENSAGENS.get(item["type"])
            mensagens.append(modelo.format(campo=campo, **item.get("ctx", {})) if modelo else item["msg"])
        return mensagens
