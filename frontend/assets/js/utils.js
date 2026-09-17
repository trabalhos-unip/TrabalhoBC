/* Utilitários gerais do sistema BOOK BOOK. */

/**
 * Formata um nome no padrão ABNT: ÚLTIMO SOBRENOME, Nome Restante.
 * Exemplo: "Machado de Assis" -> "ASSIS, Machado de"
 * Exemplo: "Clarice Lispector" -> "LISPECTOR, Clarice"
 * Exemplo: "Aristóteles" -> "ARISTÓTELES"
 */
function formatarNomeABNT(nome) {
    if (!nome || typeof nome !== 'string') return '';
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '';
    if (partes.length === 1) return partes[0].toUpperCase();

    const ultimoSobrenome = partes.pop().toUpperCase();
    const restoDoNome = partes.join(' ');
    return `${ultimoSobrenome}, ${restoDoNome}`;
}

/**
 * Recebe uma string com múltiplos valores (separados por "; ") ou um array de valores.
 * Formata o primeiro item (aplicando formatarItemFn se fornecida) e adiciona " +N" se houver mais itens.
 * Exemplo autor ABNT: "Machado de Assis; Eça de Queirós" -> "ASSIS, Machado de +1"
 * Exemplo gênero: "Ficção Científica; Romance; Distopia" -> "Ficção Científica +2"
 */
function formatarListaTruncada(dado, formatarItemFn = null) {
    if (!dado) return '';

    const itens = Array.isArray(dado)
        ? dado
        : String(dado).split('; ').map(s => s.trim()).filter(Boolean);

    if (itens.length === 0) return '';

    const primeiro = formatarItemFn ? formatarItemFn(itens[0]) : itens[0];
    if (itens.length === 1) {
        return primeiro;
    }

    return `${primeiro} +${itens.length - 1}`;
}

/* Quantas sugestões aparecem de uma vez; o resto aparece digitando mais. */
const LIMITE_SUGESTOES = 8;

/**
 * Campo de texto com lista de sugestões, no lugar de uma lista suspensa.
 *
 * Quem procura é o servidor: a cada digitação (esperando 300 ms) o campo chama
 * buscar(texto), que usa a Api. Aqui só se desenha a lista e se guarda o id
 * escolhido em this.valor.
 */
class CampoBusca {
    constructor({ input, lista, buscar, descrever, obterId }) {
        this.input = input;
        this.lista = lista;
        this.buscar = buscar;
        this.descrever = descrever;
        this.obterId = obterId;
        this.valor = '';
        this.itens = [];
        this.indiceAtivo = -1;
        this.espera = null;
        this.numeroBusca = 0;

        this.input.setAttribute('autocomplete', 'off');
        this.input.setAttribute('role', 'combobox');
        this.input.setAttribute('aria-expanded', 'false');
        this.input.setAttribute('aria-controls', this.lista.id);

        // Digitar desfaz a escolha anterior: só vale o que for escolhido na lista.
        this.input.addEventListener('input', () => {
            this.valor = '';
            this.agendarBusca(300);
        });
        // A lista abre somente quando o usuário interage explicitamente com o campo.
        // Isso evita que o popup já abra expandido ao renderizar o modal.
        this.input.addEventListener('click', () => {
            if (this.lista.hidden) this.agendarBusca(0);
        });
        this.input.addEventListener('keydown', (evento) => this.navegar(evento));
        this.input.addEventListener('blur', () => this.fechar());

        // mousedown em vez de click: escolhe antes de o blur fechar a lista.
        this.lista.addEventListener('mousedown', (evento) => {
            const opcao = evento.target.closest('[data-indice]');
            if (!opcao) return;
            evento.preventDefault();
            this.escolher(Number(opcao.dataset.indice));
        });
    }

    agendarBusca(atraso) {
        clearTimeout(this.espera);
        this.espera = setTimeout(() => this.carregar(), atraso);
    }

    async carregar() {
        const numero = ++this.numeroBusca;
        let itens = [];
        let aviso = 'Nada encontrado.';
        try {
            itens = await this.buscar(this.input.value.trim());
        } catch (erro) {
            aviso = erro.message;
        }
        // Se o usuário digitou de novo enquanto esperava, vale só a busca mais nova.
        if (numero !== this.numeroBusca) return;
        this.itens = itens;
        this.desenhar(aviso);
    }

    desenhar(aviso) {
        if (document.activeElement !== this.input) return;

        this.lista.replaceChildren();
        this.indiceAtivo = -1;

        if (this.itens.length === 0) {
            this.lista.appendChild(this.criarLinha('busca-vazia', aviso));
        }

        this.itens.slice(0, LIMITE_SUGESTOES).forEach((item, indice) => {
            const opcao = this.criarLinha('busca-opcao', this.descrever(item));
            opcao.id = `${this.lista.id}-${indice}`;
            opcao.dataset.indice = indice;
            opcao.setAttribute('role', 'option');
            this.lista.appendChild(opcao);
        });

        if (this.itens.length > LIMITE_SUGESTOES) {
            this.lista.appendChild(this.criarLinha('busca-vazia', 'Continue digitando para ver mais resultados.'));
        }

        this.abrir();
    }

    /* Usa textContent: o conteúdo vem do usuário. */
    criarLinha(classe, texto) {
        const linha = document.createElement('li');
        linha.className = classe;
        linha.textContent = texto;
        return linha;
    }

    navegar(evento) {
        const opcoes = this.lista.querySelectorAll('.busca-opcao');
        if (this.lista.hidden || opcoes.length === 0) return;

        if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
            evento.preventDefault();
            const passo = evento.key === 'ArrowDown' ? 1 : -1;
            this.indiceAtivo = (this.indiceAtivo + passo + opcoes.length) % opcoes.length;
            opcoes.forEach((opcao, indice) => opcao.classList.toggle('ativa', indice === this.indiceAtivo));
            this.input.setAttribute('aria-activedescendant', opcoes[this.indiceAtivo].id);
            opcoes[this.indiceAtivo].scrollIntoView({ block: 'nearest' });
        } else if (evento.key === 'Enter' && this.indiceAtivo >= 0) {
            evento.preventDefault();
            this.escolher(this.indiceAtivo);
        } else if (evento.key === 'Escape') {
            this.fechar();
        }
    }

    escolher(indice) {
        const item = this.itens[indice];
        if (!item) return;
        this.definir(item);
        this.fechar();
    }

    /* Preenche o campo com um item já conhecido (por exemplo, ao editar). */
    definir(item) {
        this.valor = String(this.obterId(item));
        this.input.value = this.descrever(item);
    }

    limpar() {
        clearTimeout(this.espera);
        this.numeroBusca += 1;
        this.valor = '';
        this.input.value = '';
        this.fechar();
    }

    abrir() {
        this.lista.hidden = false;
        this.input.setAttribute('aria-expanded', 'true');
    }

    fechar() {
        this.lista.hidden = true;
        this.indiceAtivo = -1;
        this.input.setAttribute('aria-expanded', 'false');
        this.input.removeAttribute('aria-activedescendant');
    }
}
