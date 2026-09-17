/* Tela de empréstimos.
 *
 * O JavaScript cuida só da tela: tema, catálogo, popups e envio do que o
 * usuário escolheu. As regras do empréstimo, a disponibilidade dos
 * exemplares, a situação, a data prevista, os filtros e a ordenação são do
 * back-end em Python. */

class TelaEmprestimos {
    constructor(api) {
        this.api = api;
        this.mensagem = document.getElementById('mensagem');
        this.mensagemFormulario = document.getElementById('mensagem-formulario');
        this.catalogList = document.getElementById('catalogList');
        this.formulario = document.getElementById('formulario-emprestimo');
        this.modalCadastro = document.getElementById('modalCadastro');
        this.modalConfirmacao = document.getElementById('modalConfirmacao');
        this.modalTitle = document.getElementById('modalTitle');
        this.confirmTitle = document.getElementById('confirmTitle');
        this.confirmLivro = document.getElementById('confirmLivro');
        this.confirmLeitor = document.getElementById('confirmLeitor');
        this.closeCadastro = document.getElementById('closeCadastro');
        this.closeConfirmacao = document.getElementById('closeConfirmacao');
        this.cancelForm = document.getElementById('cancelForm');
        this.cancelDelete = document.getElementById('cancelDelete');
        this.confirmDelete = document.getElementById('confirmDelete');
        this.openForm = document.getElementById('openForm');
        this.searchInput = document.getElementById('searchInput');
        this.filterSituacao = document.getElementById('filterSituacao');
        this.sortSelect = document.getElementById('sortSelect');
        this.themeToggle = document.getElementById('themeToggle');
        this.campoPrazo = document.getElementById('prazo_dias');
        this.leitorSelect = document.getElementById('leitorSelect');
        this.exemplarSelect = document.getElementById('exemplarSelect');

        this.leitores = [];
        this.exemplaresDisponiveis = [];
        this.emprestimoConfirmando = null;
        this.esperaBusca = null;
        this.toastTimer = null;
        this.toastHideTimer = null;
    }

    iniciar() {
        this.aplicarTemaSalvo();
        this.configurarTema();
        this.configurarCatalogo();
        this.configurarCadastro();
        this.configurarConfirmacaoDevolucao();
        this.carregarDados();
    }

    aplicarTemaSalvo() {
        const saved = document.documentElement.dataset.theme || localStorage.getItem('biblioteca-theme') || 'light';
        const tema = saved === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = tema;
        this.atualizarTemaVisual(tema);
    }

    configurarTema() {
        if (!this.themeToggle) return;

        this.themeToggle.addEventListener('click', () => {
            const proximoTema = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
            document.documentElement.dataset.theme = proximoTema;
            localStorage.setItem('biblioteca-theme', proximoTema);
            this.atualizarTemaVisual(proximoTema);
        });
    }

    atualizarTemaVisual(tema) {
        if (!this.themeToggle) return;

        const icon = this.themeToggle.querySelector('.theme-icon');
        if (!icon) return;

        icon.textContent = tema === 'dark' ? '☼' : '☀';
    }

    configurarCatalogo() {
        if (this.openForm) {
            this.openForm.addEventListener('click', () => this.abrirModalCadastro());
        }

        if (this.searchInput) {
            // Espera o usuário parar de digitar antes de pedir ao servidor.
            this.searchInput.addEventListener('input', () => {
                clearTimeout(this.esperaBusca);
                this.esperaBusca = setTimeout(() => this.carregarEmprestimos(), 300);
            });
        }

        for (const filtro of [this.filterSituacao, this.sortSelect]) {
            if (filtro) filtro.addEventListener('change', () => this.carregarEmprestimos());
        }
    }

    configurarCadastro() {
        if (!this.formulario) return;

        this.formulario.addEventListener('submit', (evento) => this.salvar(evento));

        if (this.closeCadastro) {
            this.closeCadastro.addEventListener('click', () => this.pedirFechamentoCadastro());
        }

        if (this.cancelForm) {
            this.cancelForm.addEventListener('click', () => this.pedirFechamentoCadastro());
        }

        if (this.modalCadastro) {
            this.modalCadastro.addEventListener('click', (evento) => {
                if (evento.target === this.modalCadastro) {
                    this.pedirFechamentoCadastro();
                }
            });
        }
    }

    configurarConfirmacaoDevolucao() {
        if (this.closeConfirmacao) {
            this.closeConfirmacao.addEventListener('click', () => this.fecharModalConfirmacao());
        }

        if (this.cancelDelete) {
            this.cancelDelete.addEventListener('click', () => this.fecharModalConfirmacao());
        }

        if (this.modalConfirmacao) {
            this.modalConfirmacao.addEventListener('click', (evento) => {
                if (evento.target === this.modalConfirmacao) {
                    this.fecharModalConfirmacao();
                }
            });
        }

        if (this.confirmDelete) {
            this.confirmDelete.addEventListener('click', () => this.confirmarDevolucao());
        }
    }

    filtrosAtuais() {
        return {
            busca: this.searchInput ? this.searchInput.value : '',
            situacao: this.filterSituacao ? this.filterSituacao.value : '',
            ordem: this.sortSelect ? this.sortSelect.value : ''
        };
    }

    async carregarDados() {
        try {
            const [leitores, exemplares, emprestimos] = await Promise.all([
                this.api.listarLeitores(),
                this.api.listarExemplares({ status: 'DISPONIVEL' }),
                this.api.listarEmprestimos(this.filtrosAtuais())
            ]);
            this.leitores = leitores;
            this.exemplaresDisponiveis = exemplares;
            this.preencherLeitoresSelect();
            this.preencherExemplaresSelect();
            this.desenharCatalogo(emprestimos, this.filtrosAtuais());
        } catch (erro) {
            this.exibirMensagem(erro.message, 'erro');
        }
    }

    async carregarOpcoesFormulario() {
        const [leitores, exemplares] = await Promise.all([
            this.api.listarLeitores(),
            this.api.listarExemplares({ status: 'DISPONIVEL' })
        ]);
        this.leitores = leitores;
        this.exemplaresDisponiveis = exemplares;
        this.preencherLeitoresSelect();
        this.preencherExemplaresSelect();
    }

    preencherLeitoresSelect() {
        if (!this.leitorSelect) return;

        const valorAtual = this.leitorSelect.value;
        this.leitorSelect.replaceChildren(new Option('Selecione um leitor', ''));

        for (const leitor of this.leitores) {
            this.leitorSelect.appendChild(new Option(`${leitor.nome} — ${leitor.email}`, String(leitor.id_leitor)));
        }

        if ([...this.leitorSelect.options].some((opcao) => opcao.value === valorAtual)) {
            this.leitorSelect.value = valorAtual;
        }
    }

    preencherExemplaresSelect() {
        if (!this.exemplarSelect) return;

        const valorAtual = this.exemplarSelect.value;
        this.exemplarSelect.replaceChildren(new Option('Selecione um exemplar disponível', ''));

        for (const exemplar of this.exemplaresDisponiveis) {
            const texto = `${exemplar.titulo_livro} — Código ${exemplar.id_exemplar}`;
            this.exemplarSelect.appendChild(new Option(texto, String(exemplar.id_exemplar)));
        }

        if ([...this.exemplarSelect.options].some((opcao) => opcao.value === valorAtual)) {
            this.exemplarSelect.value = valorAtual;
        }
    }

    /* Pede ao servidor os empréstimos, já filtrados, ordenados e com leitor, livro e situação. */
    async carregarEmprestimos() {
        try {
            const filtros = this.filtrosAtuais();
            const emprestimos = await this.api.listarEmprestimos(filtros);
            this.desenharCatalogo(emprestimos, filtros);
        } catch (erro) {
            this.exibirMensagem(erro.message, 'erro');
        }
    }

    desenharCatalogo(emprestimos, filtros) {
        if (!this.catalogList) return;

        this.catalogList.replaceChildren();

        if (!emprestimos || emprestimos.length === 0) {
            const filtrando = filtros.busca.trim() || filtros.situacao;
            this.exibirMensagem(filtrando
                ? 'Nenhum empréstimo encontrado com esses filtros.'
                : 'Nenhum empréstimo registrado ainda.', 'erro');
            return;
        }

        this.exibirMensagem('');
        const fragmento = document.createDocumentFragment();
        for (const emprestimo of emprestimos) {
            const item = document.createElement('article');
            item.className = 'catalog-item emprestimo-item';

            const actions = document.createElement('div');
            actions.className = 'book-actions';

            if (emprestimo.situacao === 'ATIVO') {
                const devolucao = this.criarBotaoAcao('↺', 'Registrar devolução', 'devolver');
                devolucao.addEventListener('click', () => this.abrirConfirmacaoDevolucao(emprestimo));
                actions.appendChild(devolucao);
            }

            item.append(
                this.criarColuna('LEITOR', emprestimo.nome_leitor),
                this.criarColuna('LIVRO', emprestimo.titulo_livro),
                // Código do exemplar: diz qual cópia do livro foi emprestada.
                this.criarColuna('CÓDIGO', emprestimo.id_exemplar),
                this.criarColuna('DATA DO EMPRÉSTIMO', this.formatarData(emprestimo.data_emprestimo)),
                this.criarColuna('PREVISÃO DE DEVOLUÇÃO', this.formatarData(emprestimo.data_prevista_devolucao)),
                this.criarColuna('SITUAÇÃO', emprestimo.situacao),
                actions
            );
            fragmento.appendChild(item);
        }
        this.catalogList.appendChild(fragmento);
    }

    /* Monta uma coluna do card. Usa textContent: o conteúdo vem do usuário. */
    criarColuna(rotulo, valor) {
        const coluna = document.createElement('div');
        coluna.className = 'book-meta-column';

        const label = document.createElement('span');
        label.className = 'book-label';
        label.textContent = rotulo;

        const value = document.createElement('span');
        value.className = 'book-value';
        value.textContent = valor;

        coluna.append(label, value);
        return coluna;
    }

    criarBotaoAcao(icone, titulo, tipo) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = tipo === 'devolver' ? 'icon-button' : 'icon-button delete';
        btn.title = titulo;
        btn.textContent = icone;
        return btn;
    }

    formatarData(data) {
        if (!data) return 'Sem data';
        const date = new Date(`${data}T00:00:00`);
        if (Number.isNaN(date.getTime())) return data;
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
    }

    /* Data de hoje no fuso do computador (toISOString usaria UTC e viraria o dia seguinte à noite). */
    hojeISO() {
        const hoje = new Date();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        return `${hoje.getFullYear()}-${mes}-${dia}`;
    }

    abrirModalCadastro() {
        this.formulario.reset();
        if (this.leitorSelect) this.leitorSelect.value = '';
        if (this.exemplarSelect) this.exemplarSelect.value = '';
        if (this.campoPrazo) this.campoPrazo.value = 7;
        this.modalTitle.textContent = 'Novo empréstimo';
        this.formulario.data_emprestimo.value = this.hojeISO();
        this.carregarOpcoesFormulario().catch((erro) => {
            this.exibirMensagem(erro.message, 'erro', this.mensagemFormulario);
        });

        if (this.modalCadastro) {
            this.modalCadastro.classList.add('open');
        }
        // Com o formulário aberto, limpa a mensagem da tela e a de dentro dele.
        this.exibirMensagem('', '', this.mensagemFormulario);
    }

    fecharModalCadastro() {
        if (this.modalCadastro) {
            this.modalCadastro.classList.remove('open');
        }

        if (this.formulario) {
            this.formulario.reset();
        }

        if (this.leitorSelect) this.leitorSelect.value = '';
        if (this.exemplarSelect) this.exemplarSelect.value = '';
        this.exibirMensagem('', '', this.mensagemFormulario);
    }

    formularioPreenchido() {
        return Boolean(
            (this.leitorSelect && this.leitorSelect.value)
            || (this.exemplarSelect && this.exemplarSelect.value)
            || (this.campoPrazo && this.campoPrazo.value && this.campoPrazo.value !== '7')
            || (this.formulario.data_emprestimo && this.formulario.data_emprestimo.value !== this.hojeISO())
        );
    }

    pedirFechamentoCadastro() {
        if (!this.formularioPreenchido()) {
            this.fecharModalCadastro();
            return;
        }

        if (!window.confirm('Deseja cancelar o cadastro do empréstimo?')) return;
        this.fecharModalCadastro();
    }

    /* Envia leitor, exemplar, data e prazo; as regras e a data prevista ficam no servidor. */
    async salvar(evento) {
        evento.preventDefault();
        if (!this.formulario) return;

        const botao = this.formulario.querySelector('button[type="submit"]');
        const emprestimo = {
            id_leitor: this.leitorSelect ? this.leitorSelect.value : '',
            id_exemplar: this.exemplarSelect ? this.exemplarSelect.value : '',
            data_emprestimo: this.formulario.data_emprestimo.value,
            prazo_dias: this.campoPrazo ? this.campoPrazo.value : ''
        };

        botao.disabled = true;
        this.exibirMensagem('Salvando...', '', this.mensagemFormulario);

        try {
            await this.api.registrarEmprestimo(emprestimo);
            this.fecharModalCadastro();
            await Promise.all([this.carregarOpcoesFormulario(), this.carregarEmprestimos()]);
            this.exibirMensagem('Empréstimo registrado.', 'sucesso');
        } catch (erro) {
            this.exibirMensagem(erro.message, 'erro', this.mensagemFormulario);
        } finally {
            botao.disabled = false;
        }
    }

    abrirConfirmacaoDevolucao(emprestimo) {
        if (!emprestimo || !emprestimo.id_emprestimo) return;

        this.emprestimoConfirmando = emprestimo;

        if (this.confirmTitle) {
            this.confirmTitle.textContent = 'Registrar devolução';
        }
        if (this.confirmLivro) {
            this.confirmLivro.textContent = emprestimo.titulo_livro;
        }
        if (this.confirmLeitor) {
            this.confirmLeitor.textContent = emprestimo.nome_leitor;
        }
        if (this.confirmDelete) {
            this.confirmDelete.textContent = 'Confirmar devolução';
        }

        if (this.modalConfirmacao) {
            this.modalConfirmacao.classList.add('open');
        }
    }

    fecharModalConfirmacao() {
        if (this.modalConfirmacao) {
            this.modalConfirmacao.classList.remove('open');
        }
        this.emprestimoConfirmando = null;
    }

    async confirmarDevolucao() {
        if (!this.emprestimoConfirmando) return;

        try {
            await this.api.registrarDevolucao(this.emprestimoConfirmando.id_emprestimo);
            this.fecharModalConfirmacao();
            await this.carregarEmprestimos();
            this.exibirMensagem('Devolução registrada.', 'sucesso');
        } catch (erro) {
            // O popup não tem espaço para mensagem: fecha e mostra o motivo na tela.
            this.fecharModalConfirmacao();
            this.exibirMensagem(erro.message, 'erro');
        }
    }

    /* Mostra a mensagem num lugar só: dentro do formulário, se ele estiver aberto; senão, no aviso da tela. */
    exibirMensagem(texto, tipo = '', alvo = null) {
        const classe = tipo ? `mensagem ${tipo}` : 'mensagem';
        const formularioAberto = Boolean(this.modalCadastro && this.modalCadastro.classList.contains('open'));

        if (alvo) {
            alvo.textContent = texto;
            alvo.className = alvo === this.mensagemFormulario ? `${classe} mensagem-formulario` : classe;
            return;
        }

        if (this.mensagemFormulario) {
            this.mensagemFormulario.textContent = formularioAberto ? texto : '';
            this.mensagemFormulario.className = `${formularioAberto ? classe : 'mensagem'} mensagem-formulario`;
        }

        if (!this.mensagem) return;

        clearTimeout(this.toastTimer);
        clearTimeout(this.toastHideTimer);
        this.mensagem.classList.remove('toast-visible', 'toast-leaving');
        this.mensagem.textContent = formularioAberto ? '' : texto;
        this.mensagem.className = formularioAberto ? 'mensagem' : classe;
        this.mensagem.setAttribute('role', 'status');
        this.mensagem.setAttribute('aria-live', 'polite');

        if (!formularioAberto && (tipo === 'sucesso' || tipo === 'erro')) {
            this.mensagem.classList.add('toast-visible');

            const tempoVisivel = tipo === 'erro' ? 10000 : 2600;

            this.toastTimer = setTimeout(() => {
                this.mensagem.classList.add('toast-leaving');
                this.mensagem.classList.remove('toast-visible');
            }, tempoVisivel);

            this.toastHideTimer = setTimeout(() => {
                this.mensagem.classList.remove('toast-visible', 'toast-leaving');
                this.mensagem.textContent = '';
                this.mensagem.className = 'mensagem';
            }, tempoVisivel + 800);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('formulario-emprestimo')) return;
    new TelaEmprestimos(new Api()).iniciar();
});
