/* Telas de livros.
 *
 * O JavaScript cuida só da tela: tema, catálogo, popups e envio do que o
 * usuário digitou. Validação, filtros, ordenação e datas são feitos pelo
 * back-end em Python. */

class TelaLivros {
    constructor(api) {
        this.api = api;
        this.mensagem = document.getElementById('mensagem');
        this.mensagemFormulario = document.getElementById('mensagem-formulario');
        this.mensagemExclusao = document.getElementById('mensagem-exclusao');
        this.catalogList = document.getElementById('catalogList');
        this.formulario = document.getElementById('formulario-livro');
        this.modalBackdrop = document.getElementById('modalBackdrop');
        this.modalTitle = document.getElementById('modalTitle');
        this.modalSubtitle = document.getElementById('modalSubtitle');
        this.closeModal = document.getElementById('closeModal');
        this.cancelForm = document.getElementById('cancelForm');
        this.viewBackdrop = document.getElementById('viewBackdrop');
        this.closeView = document.getElementById('closeView');
        this.closeViewBook = document.getElementById('closeViewBook');
        this.confirmBackdrop = document.getElementById('confirmBackdrop');
        this.closeConfirm = document.getElementById('closeConfirm');
        this.cancelDelete = document.getElementById('cancelDelete');
        this.confirmDelete = document.getElementById('confirmDelete');
        this.confirmLivro = document.getElementById('confirmLivro');
        this.openForm = document.getElementById('openForm');
        this.searchInput = document.getElementById('searchInput');
        this.filterGenero = document.getElementById('filterGenero');
        this.sortSelect = document.getElementById('sortSelect');
        this.campoAno = document.getElementById('ano_lancamento');
        this.campoDataCadastro = document.getElementById('data_cadastro');
        this.campoResumo = document.getElementById('resumo');
        this.contadorResumo = document.getElementById('contador-resumo');
        this.themeToggle = document.getElementById('themeToggle');
        this.viewTitle = document.getElementById('viewTitle');
        this.viewSubtitle = document.getElementById('viewSubtitle');
        this.viewAnoLancamento = document.getElementById('viewAnoLancamento');
        this.viewDataCadastro = document.getElementById('viewDataCadastro');
        this.viewCodigo = document.getElementById('viewCodigo');
        this.viewGenero = document.getElementById('viewGenero');
        this.viewResumo = document.getElementById('viewResumo');

        // Estado das tags/chips do formulário
        this.autores = [];
        this.generos = [];

        this.inputAutor = document.getElementById('input-autor');
        this.btnAddAutor = document.getElementById('btn-add-autor');
        this.chipsAutor = document.getElementById('chips-autor');

        this.inputGenero = document.getElementById('input-genero');
        this.btnAddGenero = document.getElementById('btn-add-genero');
        this.chipsGenero = document.getElementById('chips-genero');

        this.botaoSalvar = null;
        this.livroEditandoId = null;
        this.livroExcluindo = null;
        this.dadosOriginais = null;
        this.fechamentoPendente = false;
        this.esperaBusca = null;
        this.toastTimer = null;
        this.toastHideTimer = null;
    }

    iniciar() {
        this.aplicarTemaSalvo();
        this.configurarTema();

        // A página inicial só tem o tema; o resto é da página do catálogo.
        if (!this.catalogList) return;

        this.configurarCatalogo();
        this.configurarCadastro();
        this.configurarVisualizacao();
        this.configurarExclusao();
        this.carregarOpcoesDeFiltro();
        this.carregarLivros();
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
        this.openForm.addEventListener('click', () => this.abrirCadastro());

        // Espera o usuário parar de digitar antes de pedir ao servidor.
        this.searchInput.addEventListener('input', () => {
            clearTimeout(this.esperaBusca);
            this.esperaBusca = setTimeout(() => this.carregarLivros(), 300);
        });

        for (const filtro of [this.filterGenero, this.sortSelect]) {
            filtro.addEventListener('change', () => this.carregarLivros());
        }
    }

    configurarCadastro() {
        this.botaoSalvar = this.formulario.querySelector('button[type="submit"]');

        this.formulario.addEventListener('submit', (evento) => this.salvar(evento));
        this.formulario.addEventListener('input', () => this.limparAvisoDeFechamento());
        this.closeModal.addEventListener('click', () => this.pedirFechamento());
        this.cancelForm.addEventListener('click', () => this.pedirFechamento());
        this.modalBackdrop.addEventListener('click', (evento) => {
            if (evento.target === this.modalBackdrop) this.pedirFechamento();
        });

        this.campoAno.max = new Date().getFullYear();
        this.campoResumo.addEventListener('input', () => this.atualizarContadorResumo());

        this.configurarCampoTag(this.inputAutor, this.btnAddAutor, 'autor');
        this.configurarCampoTag(this.inputGenero, this.btnAddGenero, 'genero');
    }

    configurarCampoTag(input, btn, tipo) {
        if (!input) return;

        input.addEventListener('keydown', (evento) => {
            if (evento.key === 'Enter') {
                evento.preventDefault();
                this.adicionarTag(tipo);
            }
        });

        if (btn) {
            btn.addEventListener('click', () => this.adicionarTag(tipo));
        }
    }

    adicionarTag(tipo) {
        let input, array;
        if (tipo === 'autor') {
            input = this.inputAutor;
            array = this.autores;
        } else if (tipo === 'genero') {
            input = this.inputGenero;
            array = this.generos;
        }

        if (!input || !array) return;

        const valor = input.value.trim();
        if (!valor) return;

        array.push(valor);
        input.value = '';
        this.desenharTags(tipo);
        this.limparAvisoDeFechamento();
    }

    removerTag(tipo, indice) {
        let array;
        if (tipo === 'autor') array = this.autores;
        else if (tipo === 'genero') array = this.generos;

        if (!array) return;

        array.splice(indice, 1);
        this.desenharTags(tipo);
        this.limparAvisoDeFechamento();
    }

    desenharTags(tipo) {
        let container, array;
        if (tipo === 'autor') {
            container = this.chipsAutor;
            array = this.autores;
        } else if (tipo === 'genero') {
            container = this.chipsGenero;
            array = this.generos;
        }

        if (!container) return;

        container.replaceChildren();

        array.forEach((texto, index) => {
            const chip = this.criarElemento('span', 'tag-chip');
            const spanTexto = this.criarElemento('span', '', texto);

            const btnRemove = this.criarElemento('button', 'tag-chip-remove', '×');
            btnRemove.type = 'button';
            btnRemove.title = 'Remover';
            btnRemove.setAttribute('aria-label', `Remover ${texto}`);
            btnRemove.addEventListener('click', () => this.removerTag(tipo, index));

            chip.append(spanTexto, btnRemove);
            container.appendChild(chip);
        });
    }

    configurarVisualizacao() {
        this.closeView.addEventListener('click', () => this.fecharVisualizacao());
        this.closeViewBook.addEventListener('click', () => this.fecharVisualizacao());
        this.viewBackdrop.addEventListener('click', (evento) => {
            if (evento.target === this.viewBackdrop) this.fecharVisualizacao();
        });
    }

    configurarExclusao() {
        this.confirmDelete.addEventListener('click', () => this.excluirLivro());
        this.cancelDelete.addEventListener('click', () => this.fecharConfirmacao());
        this.closeConfirm.addEventListener('click', () => this.fecharConfirmacao());
        this.confirmBackdrop.addEventListener('click', (evento) => {
            if (evento.target === this.confirmBackdrop) this.fecharConfirmacao();
        });
    }

    async carregarOpcoesDeFiltro() {
        try {
            const opcoes = await this.api.opcoesDeFiltro();
            this.preencherSelect(this.filterGenero, opcoes.generos);
        } catch (erro) {
            this.exibirMensagem(erro.message, 'erro');
        }
    }

    preencherSelect(select, valores) {
        const atual = select.value;

        select.replaceChildren(new Option('Todos', ''));
        for (const valor of valores) {
            select.appendChild(new Option(valor, valor));
        }
        if (valores.includes(atual)) select.value = atual;
    }

    filtrosAtuais() {
        return {
            busca: this.searchInput.value,
            genero: this.filterGenero.value,
            ordem: this.sortSelect.value
        };
    }

    /* Pede ao servidor os livros; busca, filtros e ordenação são feitos no Python. */
    async carregarLivros() {
        try {
            const filtros = this.filtrosAtuais();
            const livros = await this.api.listarLivros(filtros);
            this.desenharCatalogo(livros, filtros);
        } catch (erro) {
            this.catalogList.replaceChildren();
            this.exibirMensagem(erro.message, 'erro');
        }
    }

    desenharCatalogo(livros, filtros) {
        this.catalogList.replaceChildren();

        if (livros.length === 0) {
            const filtrando = filtros.busca.trim() || filtros.genero;
            this.exibirMensagem(filtrando
                ? 'Nenhum livro encontrado com esses filtros.'
                : 'Nenhum livro cadastrado ainda. Clique em "Cadastrar novo livro".');
            return;
        }

        this.exibirMensagem('');
        const fragmento = document.createDocumentFragment();
        for (const livro of livros) {
            fragmento.appendChild(this.criarItem(livro));
        }
        this.catalogList.appendChild(fragmento);
    }

    /* Monta um card do catálogo. Usa textContent: o conteúdo vem do usuário. */
    criarItem(livro) {
        const autorFormatado = formatarListaTruncada(livro.autor, formatarNomeABNT);
        const generoFormatado = formatarListaTruncada(livro.genero);

        const principal = this.criarElemento('div', 'book-main');
        principal.append(
            this.criarElemento('div', 'book-title', livro.titulo),
            this.criarElemento('div', 'book-author', autorFormatado)
        );

        const ver = this.criarBotaoAcao('👁', 'Ver livro', 'view');
        ver.addEventListener('click', () => this.visualizarLivro(livro));

        const editar = this.criarBotaoAcao('✎', 'Editar livro', 'edit');
        editar.addEventListener('click', () => this.editarLivro(livro));

        const excluir = this.criarBotaoAcao('×', 'Excluir livro', 'delete');
        excluir.addEventListener('click', () => this.confirmarExclusao(livro));

        const acoes = this.criarElemento('div', 'book-actions');
        acoes.append(ver, editar, excluir);

        const item = this.criarElemento('article', 'catalog-item');
        item.append(
            principal,
            this.criarColuna('GÊNERO', generoFormatado),
            this.criarColuna('ANO DE LANÇAMENTO', livro.ano_lancamento),
            this.criarColuna('DATA DE CADASTRO', this.formatarData(livro.data_cadastro)),
            acoes
        );
        return item;
    }

    criarColuna(rotulo, valor) {
        const coluna = this.criarElemento('div', 'book-meta-column');
        coluna.append(
            this.criarElemento('span', 'book-label', rotulo),
            this.criarElemento('span', 'book-value', valor)
        );
        return coluna;
    }

    criarBotaoAcao(icone, titulo, tipo) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = tipo === 'delete' ? 'icon-button delete' : 'icon-button';
        btn.title = titulo;
        btn.setAttribute('aria-label', titulo);
        btn.textContent = icone;
        return btn;
    }

    criarElemento(tag, classe, texto) {
        const elemento = document.createElement(tag);
        elemento.className = classe;
        if (texto !== undefined) elemento.textContent = texto;
        return elemento;
    }

    formatarData(data) {
        if (!data) return 'Sem data';
        const date = new Date(`${data}T00:00:00`);
        if (Number.isNaN(date.getTime())) return data;
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
    }

    abrirCadastro() {
        this.livroEditandoId = null;
        this.formulario.reset();
        this.autores = [];
        this.generos = [];
        if (this.inputAutor) this.inputAutor.value = '';
        if (this.inputGenero) this.inputGenero.value = '';
        this.desenharTags('autor');
        this.desenharTags('genero');
        this.campoDataCadastro.value = this.hojeISO();
        this.abrirPopupDoFormulario(
            'Cadastrar livro',
            'Preencha os dados abaixo para adicionar o livro ao acervo.',
            'Cadastrar livro'
        );
    }

    editarLivro(livro) {
        this.livroEditandoId = livro.id_livro;
        this.formulario.titulo.value = livro.titulo;

        // Separa a string salva no backend por "; " para preencher as tags no formulário
        this.autores = livro.autor ? livro.autor.split('; ').map(s => s.trim()).filter(Boolean) : [];
        this.generos = livro.genero ? livro.genero.split('; ').map(s => s.trim()).filter(Boolean) : [];

        if (this.inputAutor) this.inputAutor.value = '';
        if (this.inputGenero) this.inputGenero.value = '';

        this.desenharTags('autor');
        this.desenharTags('genero');

        this.formulario.ano_lancamento.value = livro.ano_lancamento;
        this.formulario.resumo.value = livro.resumo;
        // A data de cadastro não muda na edição: mostra a do livro.
        this.campoDataCadastro.value = livro.data_cadastro;
        this.abrirPopupDoFormulario(
            'Editar livro',
            'Altere os dados do livro e salve as mudanças.',
            'Salvar alterações'
        );
    }

    /* Deixa o popup pronto e guarda o estado inicial, para saber se mudou algo. */
    abrirPopupDoFormulario(titulo, subtitulo, textoDoBotao) {
        this.modalTitle.textContent = titulo;
        this.modalSubtitle.textContent = subtitulo;
        this.botaoSalvar.textContent = textoDoBotao;
        this.dadosOriginais = JSON.stringify(this.dadosDoFormulario());
        this.fechamentoPendente = false;
        this.atualizarContadorResumo();
        this.exibirMensagem('', '', this.mensagemFormulario);
        this.modalBackdrop.classList.add('open');
        this.formulario.titulo.focus();
    }

    dadosDoFormulario() {
        if (this.inputAutor && this.inputAutor.value.trim()) {
            this.adicionarTag('autor');
        }
        if (this.inputGenero && this.inputGenero.value.trim()) {
            this.adicionarTag('genero');
        }

        return {
            titulo: this.formulario.titulo.value,
            autor: this.autores.join('; '),
            genero: this.generos.join('; '),
            ano_lancamento: this.formulario.ano_lancamento.value,
            resumo: this.formulario.resumo.value
        };
    }

    formularioAlterado() {
        return JSON.stringify(this.dadosDoFormulario()) !== this.dadosOriginais;
    }

    formularioPreenchido() {
        return Boolean(
            this.formulario.titulo.value.trim()
            || this.autores.length
            || this.generos.length
            || this.formulario.ano_lancamento.value
            || this.formulario.resumo.value.trim()
            || (this.inputAutor && this.inputAutor.value.trim())
            || (this.inputGenero && this.inputGenero.value.trim())
        );
    }

    /* Fechar pelo X, pelo Voltar ou clicando fora pede confirmação se houver dados no formulário. */
    pedirFechamento() {
        const deveConfirmar = Boolean(this.livroEditandoId || this.formularioAlterado() || this.formularioPreenchido());
        const pergunta = this.livroEditandoId
            ? 'Deseja cancelar a edição do livro?'
            : 'Deseja cancelar o cadastro do livro?';

        if (deveConfirmar && !window.confirm(pergunta)) return;
        this.fecharFormulario();
    }

    limparAvisoDeFechamento() {
        if (!this.fechamentoPendente) return;

        this.fechamentoPendente = false;
        this.exibirMensagem('', '', this.mensagemFormulario);
    }

    fecharFormulario() {
        this.modalBackdrop.classList.remove('open');
        this.formulario.reset();
        this.autores = [];
        this.generos = [];
        if (this.inputAutor) this.inputAutor.value = '';
        if (this.inputGenero) this.inputGenero.value = '';
        this.desenharTags('autor');
        this.desenharTags('genero');
        this.livroEditandoId = null;
        this.fechamentoPendente = false;
    }

    visualizarLivro(livro) {
        this.viewTitle.textContent = livro.titulo;

        const autoresLista = livro.autor
            ? livro.autor.split('; ').map(s => s.trim()).filter(Boolean)
            : [];
        const autoresABNT = autoresLista.map(formatarNomeABNT).join('; ');
        this.viewSubtitle.textContent = autoresABNT || 'Autor desconhecido';

        this.viewAnoLancamento.textContent = livro.ano_lancamento;
        this.viewDataCadastro.textContent = this.formatarData(livro.data_cadastro);
        this.viewCodigo.textContent = livro.id_livro;

        if (this.viewGenero) {
            const generosLista = livro.genero
                ? livro.genero.split('; ').map(s => s.trim()).filter(Boolean)
                : [];
            this.viewGenero.textContent = generosLista.join(', ') || 'Não informado';
        }

        if (this.viewResumo) {
            this.viewResumo.textContent = livro.resumo || 'Sem resumo.';
        }

        this.viewBackdrop.classList.add('open');
    }

    fecharVisualizacao() {
        this.viewBackdrop.classList.remove('open');
    }

    confirmarExclusao(livro) {
        this.livroExcluindo = livro;
        this.confirmLivro.textContent = `"${livro.titulo}"`;
        this.exibirMensagem('', '', this.mensagemExclusao);
        this.confirmBackdrop.classList.add('open');
        this.cancelDelete.focus();
    }

    fecharConfirmacao() {
        this.confirmBackdrop.classList.remove('open');
        this.livroExcluindo = null;
    }

    async excluirLivro() {
        const livro = this.livroExcluindo;
        if (!livro) return;

        this.confirmDelete.disabled = true;

        try {
            const excluido = await this.api.excluirLivro(livro.id_livro);
            this.fecharConfirmacao();
            await Promise.all([this.carregarOpcoesDeFiltro(), this.carregarLivros()]);
            this.exibirMensagem(`Livro "${excluido.titulo}" excluído do acervo.`, 'sucesso');
        } catch (erro) {
            this.exibirMensagem(erro.message, 'erro', this.mensagemExclusao);
        } finally {
            this.confirmDelete.disabled = false;
        }
    }

    atualizarContadorResumo() {
        const total = this.campoResumo.value.length;
        const limite = this.campoResumo.maxLength;
        const atingiu = total >= limite;

        this.contadorResumo.textContent = `${total}/${limite} caracteres${atingiu ? ' — limite atingido' : ''}`;
        this.contadorResumo.classList.toggle('limite', atingiu);
    }

    /* Só para mostrar no formulário; a data gravada é definida pelo servidor. */
    hojeISO() {
        const hoje = new Date();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        return `${hoje.getFullYear()}-${mes}-${dia}`;
    }

    async salvar(evento) {
        evento.preventDefault();

        const livro = this.dadosDoFormulario();

        // Validação de tags obrigatórias e limites de tamanho
        if (this.autores.length === 0) {
            this.exibirMensagem('Informe ao menos um autor.', 'erro', this.mensagemFormulario);
            if (this.inputAutor) this.inputAutor.focus();
            return;
        }
        if (livro.autor.length > 150) {
            this.exibirMensagem('O campo Autor(es) excede o limite de 150 caracteres no total.', 'erro', this.mensagemFormulario);
            return;
        }

        if (this.generos.length === 0) {
            this.exibirMensagem('Informe ao menos um gênero.', 'erro', this.mensagemFormulario);
            if (this.inputGenero) this.inputGenero.focus();
            return;
        }
        if (livro.genero.length > 80) {
            this.exibirMensagem('O campo Gênero(s) excede o limite de 80 caracteres no total.', 'erro', this.mensagemFormulario);
            return;
        }

        const editando = this.livroEditandoId;

        // Objeto formatado para o back-end (Python app/models/livro.py).
        const livroParaEnvio = {
            titulo: livro.titulo,
            autor: livro.autor,
            genero: livro.genero,
            ano_lancamento: livro.ano_lancamento,
            resumo: livro.resumo
        };

        this.botaoSalvar.disabled = true;
        this.exibirMensagem('Salvando...', '', this.mensagemFormulario);

        try {
            const salvo = editando
                ? await this.api.atualizarLivro(editando, livroParaEnvio)
                : await this.api.cadastrarLivro(livroParaEnvio);

            this.fecharFormulario();
            await Promise.all([this.carregarOpcoesDeFiltro(), this.carregarLivros()]);
            this.exibirMensagem(
                `Livro "${salvo.titulo}" ${editando ? 'atualizado' : 'cadastrado'} com sucesso.`,
                'sucesso'
            );
        } catch (erro) {
            this.exibirMensagem(erro.message, 'erro', this.mensagemFormulario);
        } finally {
            this.botaoSalvar.disabled = false;
        }
    }

    /* Mostra a mensagem só no lugar pedido: no aviso da tela, no formulário ou no popup de exclusão. */
    exibirMensagem(texto, tipo = '', alvo = this.mensagem) {
        if (!alvo) return;

        const classe = tipo ? `mensagem ${tipo}` : 'mensagem';

        if (alvo !== this.mensagem) {
            alvo.textContent = texto;
            alvo.className = alvo === this.mensagemFormulario ? `${classe} mensagem-formulario` : classe;
            return;
        }

        clearTimeout(this.toastTimer);
        clearTimeout(this.toastHideTimer);
        this.mensagem.classList.remove('toast-visible', 'toast-leaving');
        this.mensagem.textContent = texto;
        this.mensagem.className = classe;
        this.mensagem.setAttribute('role', 'status');
        this.mensagem.setAttribute('aria-live', 'polite');

        if (tipo === 'sucesso' || tipo === 'erro') {
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
    // Sem trava por página: na página inicial, iniciar() só liga o botão de tema.
    new TelaLivros(new Api()).iniciar();
});
