-- ---------------------------------------------------------------------------
-- ddl.sql — criação do banco e das tabelas do sistema.
--
-- Como executar:
--     mysql -u root -p < database/ddl.sql
-- ---------------------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS biblioteca
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE biblioteca;

-- Remova primeiro as tabelas que dependem de outras para as chaves
-- estrangeiras nao impedirem a recriacao durante o desenvolvimento.
DROP TABLE IF EXISTS emprestimos;
DROP TABLE IF EXISTS exemplares;
DROP TABLE IF EXISTS leitores;
DROP TABLE IF EXISTS livros;

CREATE TABLE livros (
    id_livro       INT AUTO_INCREMENT,
    titulo         VARCHAR(200)  NOT NULL,
    autor          VARCHAR(150)  NOT NULL,
    genero         VARCHAR(80)   NOT NULL,
    ano_lancamento SMALLINT      NOT NULL,
    resumo         VARCHAR(1000) NOT NULL,
    data_cadastro  DATE          NOT NULL,

    CONSTRAINT pk_livros PRIMARY KEY (id_livro),
    CONSTRAINT uq_livros_titulo_autor UNIQUE (titulo, autor),
    CONSTRAINT ck_livros_ano CHECK (ano_lancamento BETWEEN 1450 AND 2100),
    INDEX idx_livros_genero (genero),
    INDEX idx_livros_autor (autor),
    INDEX idx_livros_data_cadastro (data_cadastro),
    INDEX idx_livros_ano_lancamento (ano_lancamento)
) ENGINE = InnoDB;

CREATE TABLE leitores (
    id_leitor      INT AUTO_INCREMENT,
    nome           VARCHAR(150) NOT NULL,
    email          VARCHAR(150) NOT NULL,
    telefone       VARCHAR(20)  NOT NULL,
    data_cadastro  DATE         NOT NULL,

    CONSTRAINT pk_leitores PRIMARY KEY (id_leitor),
    CONSTRAINT uq_leitores_email UNIQUE (email),
    INDEX idx_leitores_nome (nome)
) ENGINE = InnoDB;

CREATE TABLE exemplares (
    id_exemplar INT AUTO_INCREMENT,
    id_livro    INT NOT NULL,
    status      ENUM('DISPONIVEL', 'EMPRESTADO') NOT NULL DEFAULT 'DISPONIVEL',

    CONSTRAINT pk_exemplares PRIMARY KEY (id_exemplar),
    CONSTRAINT fk_exemplares_livros
        FOREIGN KEY (id_livro) REFERENCES livros (id_livro)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_exemplares_livro (id_livro),
    INDEX idx_exemplares_status (status)
) ENGINE = InnoDB;

CREATE TABLE emprestimos (
    id_emprestimo   INT AUTO_INCREMENT,
    id_leitor       INT  NOT NULL,
    id_exemplar     INT  NOT NULL,
    data_emprestimo DATE NOT NULL,
    data_prevista_devolucao DATE NOT NULL,
    data_devolucao  DATE NULL,

    CONSTRAINT pk_emprestimos PRIMARY KEY (id_emprestimo),
    CONSTRAINT fk_emprestimos_leitores
        FOREIGN KEY (id_leitor) REFERENCES leitores (id_leitor)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_emprestimos_exemplares
        FOREIGN KEY (id_exemplar) REFERENCES exemplares (id_exemplar)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT ck_emprestimos_datas
        CHECK (data_devolucao IS NULL OR data_devolucao >= data_emprestimo),
    CONSTRAINT ck_emprestimos_prevista
        CHECK (data_prevista_devolucao > data_emprestimo),
    INDEX idx_emprestimos_leitor (id_leitor),
    INDEX idx_emprestimos_exemplar (id_exemplar),
    INDEX idx_emprestimos_abertos (data_devolucao),
    INDEX idx_emprestimos_prevista (data_prevista_devolucao)
) ENGINE = InnoDB;
