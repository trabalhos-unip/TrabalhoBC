/* Comunicação com o back-end.
 *
 * A classe Api concentra todas as chamadas HTTP. Nenhuma outra parte do
 * front-end usa fetch diretamente, e nenhum dado fica guardado aqui: tudo
 * vem do servidor Python. */

class Api {
    constructor(base = '/api') {
        this.base = base;
        this.requisicoesPendentes = new Map();
    }

    /* ---------- Livros ---------- */

    /* Busca os livros; filtros e ordenação são aplicados pelo servidor. */
    async listarLivros(filtros = {}) {
        return this.requisitar(this.comFiltros('/livros', filtros));
    }

    /* Gêneros cadastrados, para preencher o filtro. */
    async opcoesDeFiltro() {
        return this.requisitar('/livros/filtros');
    }

    async cadastrarLivro(livro) {
        return this.enviar('/livros', 'POST', livro);
    }

    async atualizarLivro(idLivro, livro) {
        return this.enviar(`/livros/${idLivro}`, 'PUT', livro);
    }

    async excluirLivro(idLivro) {
        return this.requisitar(`/livros/${idLivro}`, { method: 'DELETE' });
    }

    /* ---------- Leitores ---------- */

    async listarLeitores(filtros = {}) {
        return this.requisitar(this.comFiltros('/leitores', filtros));
    }

    async cadastrarLeitor(leitor) {
        return this.enviar('/leitores', 'POST', leitor);
    }

    async atualizarLeitor(idLeitor, leitor) {
        return this.enviar(`/leitores/${idLeitor}`, 'PUT', leitor);
    }

    async excluirLeitor(idLeitor) {
        return this.requisitar(`/leitores/${idLeitor}`, { method: 'DELETE' });
    }

    /* ---------- Exemplares ---------- */

    /* Com { status: 'DISPONIVEL' }, só os exemplares que podem ser emprestados. */
    async listarExemplares(filtros = {}) {
        return this.requisitar(this.comFiltros('/exemplares', filtros));
    }

    async cadastrarExemplar(exemplar) {
        return this.enviar('/exemplares', 'POST', exemplar);
    }

    async excluirExemplar(idExemplar) {
        return this.requisitar(`/exemplares/${idExemplar}`, { method: 'DELETE' });
    }

    /* ---------- Empréstimos ---------- */

    async listarEmprestimos(filtros = {}) {
        return this.requisitar(this.comFiltros('/emprestimos', filtros));
    }

    async registrarEmprestimo(emprestimo) {
        return this.enviar('/emprestimos', 'POST', emprestimo);
    }

    async registrarDevolucao(idEmprestimo) {
        return this.requisitar(`/emprestimos/${idEmprestimo}/devolucao`, { method: 'PUT' });
    }

    /* ---------- Apoio ---------- */

    /* Monta a query string só com os filtros preenchidos. */
    comFiltros(caminho, filtros) {
        const parametros = new URLSearchParams();
        for (const [chave, valor] of Object.entries(filtros)) {
            if (valor) parametros.append(chave, valor);
        }
        const consulta = parametros.toString();
        return consulta ? `${caminho}?${consulta}` : caminho;
    }

    /* Envia dados em JSON. */
    async enviar(caminho, metodo, dados) {
        this.requisicoesPendentes.clear();
        return this.requisitar(caminho, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
    }

    /* Faz a requisição e transforma erro do servidor em exceção. */
    async requisitar(caminho, opcoes = {}) {
        const metodo = (opcoes.method || 'GET').toUpperCase();
        if (metodo !== 'GET') {
            this.requisicoesPendentes.clear();
        }

        if (metodo === 'GET' && this.requisicoesPendentes.has(caminho)) {
            return this.requisicoesPendentes.get(caminho);
        }

        const requisicao = this.executarRequisicao(caminho, opcoes);
        if (metodo === 'GET') {
            this.requisicoesPendentes.set(caminho, requisicao);
            requisicao.finally(() => this.requisicoesPendentes.delete(caminho));
        }
        return requisicao;
    }

    async executarRequisicao(caminho, opcoes = {}) {
        let resposta;
        try {
            resposta = await fetch(this.base + caminho, opcoes);
        } catch (erro) {
            throw new Error(
                'Não foi possível falar com o servidor. Rode "python -m app.main" '
                + 'e abra o sistema por http://127.0.0.1:8000 (não pelo arquivo).'
            );
        }

        const corpo = await resposta.json().catch(() => null);

        if (!resposta.ok) {
            throw new Error(corpo && corpo.erro ? corpo.erro : `Erro ${resposta.status} ao acessar o servidor.`);
        }

        return corpo;
    }
}
