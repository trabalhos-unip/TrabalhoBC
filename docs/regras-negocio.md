# Regras de negocio

As regras abaixo sao aplicadas pelos services antes de qualquer gravacao no banco. As restricoes equivalentes tambem existem no MySQL, definidas em `database/ddl.sql`.

## Livros

| Regra | Comportamento |
| --- | --- |
| Campos obrigatorios | Titulo, autor, genero, ano de lancamento e resumo nao podem ficar vazios. |
| Limites | Titulo: 200 caracteres; autor: 150; genero: 80; resumo: 1.000. |
| Ano | Deve estar entre 1450 e o ano atual. |
| Duplicidade | Nao pode haver dois livros com o mesmo titulo e autor. |
| Exclusao | Um livro com exemplares cadastrados nao pode ser removido. |

## Leitores

| Regra | Comportamento |
| --- | --- |
| Campos obrigatorios | Nome, e-mail e telefone sao obrigatorios. |
| E-mail | Precisa ter formato valido, e armazenado em minusculas e e unico. |
| Telefone | Deve ter DDD + numero: 10 digitos para fixo ou 11 digitos para celular. |
| Exclusao | Um leitor que possui emprestimos, ativos ou devolvidos, nao pode ser removido. |

## Exemplares

| Regra | Comportamento |
| --- | --- |
| Vínculo | Todo exemplar deve apontar para um livro existente. |
| Cadastro | Todo exemplar novo inicia como `DISPONIVEL`. |
| Status | O status nao pode ser escolhido ou editado manualmente. |
| Exclusao | Um exemplar emprestado ou com historico de emprestimos nao pode ser removido. |

## Emprestimos e devolucoes

| Regra | Comportamento |
| --- | --- |
| Cadastro | Exige leitor e exemplar existentes. |
| Disponibilidade | Apenas um exemplar `DISPONIVEL` pode ser emprestado. |
| Data | A data do emprestimo nao pode estar no futuro. |
| Transacao | O registro do emprestimo e a mudanca para `EMPRESTADO` ocorrem juntos. |
| Devolucao | Registra a data atual e devolve o exemplar para `DISPONIVEL`. |
| Historico | Um emprestimo devolvido permanece registrado; sua devolucao nao pode ser repetida. |

## Regras do banco

O MySQL complementa as regras da aplicacao com:

- chaves estrangeiras entre livros, exemplares, leitores e emprestimos;
- `ON DELETE RESTRICT` para preservar registros relacionados;
- unicidade de `(titulo, autor)` em livros e de `email` em leitores;
- verificacao do ano de lancamento e da ordem entre as datas do emprestimo;
- indices para as consultas mais usadas.
