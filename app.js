/* Chamados de Manutenção — Gato Preto. App de página única, sem dependências. */
(function () {
  'use strict';
  const R = window.Regras;

  /* ===================== utilidades ===================== */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('chgp.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('chgp.' + k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
    del(k) { try { localStorage.removeItem('chgp.' + k); } catch (e) { /* ignora */ } },
  };
  const FMT = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const agora = () => FMT.format(new Date()).replace(',', '');
  const fmtDH = s => { if (!s) return ''; const [d, h] = String(s).split(' '); const [a, m, dd] = d.split('-'); return dd + '/' + m + '/' + a.slice(2) + (h ? ' ' + h : ''); };
  function fmtDur(min) {
    min = Math.abs(min);
    if (min < 60) return min + ' min';
    if (min < 48 * 60) return Math.round(min / 60) + ' h';
    return Math.round(min / 1440) + ' dias';
  }
  function haQuanto(s) {
    const min = Math.round((R.paraMs(agora()) - R.paraMs(s)) / 60000);
    if (min < 1) return 'agora';
    return 'há ' + fmtDur(min);
  }
  const categoriaTxt = c => c.categoria === 'Outros' && c.categoria_outro ? c.categoria_outro : c.categoria;

  const ICON = {
    lista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    pessoas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    local: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    setor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
    atualizar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
  };

  /* ===================== estado ===================== */
  const st = {
    sessao: LS.get('sessao', null),
    dados: null,
    aba: 'fila',
    setor: null,
    busca: '',
    statusTodos: 'ABERTOS',
    fotoCache: {},
  };
  const eu = () => st.sessao && st.sessao.usuario;
  const ehAdmin = () => eu() && eu().perfil === 'ADMIN';
  const meu = (campo, c) => R.mesmo(c[campo], eu().nome);

  /* ===================== API ===================== */
  async function api(acao, dados) {
    try { return await window.API.chamar(acao, dados, st.sessao && st.sessao.token); }
    catch (e) { if (String(e.message) === 'SESSAO_EXPIRADA') { sair(); throw new Error('Sua sessão expirou. Entre de novo.'); } throw e; }
  }
  async function carregar(silencioso) {
    try {
      st.dados = await api('carregar');
      LS.set('cache', { usuario: eu().id, dados: st.dados });
      // Não redesenha a tela se a pessoa estiver preenchendo algo (formulário aberto, janela aberta ou campo em foco)
      const preenchendo = partes()[0] === 'novo' || $('.modal-fundo') || document.activeElement.matches('input, textarea, select');
      if (silencioso && !preenchendo) render();
    } catch (e) { if (!silencioso || !st.dados) throw e; }
  }
  function atualizarLocal(c) {
    const i = st.dados.chamados.findIndex(x => x.numero === c.numero);
    if (i >= 0) st.dados.chamados[i] = c; else st.dados.chamados.push(c);
    LS.set('cache', { usuario: eu().id, dados: st.dados });
  }

  /* ===================== UI comum ===================== */
  let tToast;
  function toast(msg, erro) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.toggle('erro', !!erro); t.hidden = false;
    clearTimeout(tToast); tToast = setTimeout(() => { t.hidden = true; }, erro ? 5000 : 2800);
  }
  function modal(html, montar, aoFechar) {
    const f = document.createElement('div');
    f.className = 'modal-fundo';
    f.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(f);
    const onKey = e => { if (e.key === 'Escape') fechar(); };
    const fechar = () => { if (!f.isConnected) return; f.remove(); document.removeEventListener('keydown', onKey); if (aoFechar) aoFechar(); };
    document.addEventListener('keydown', onKey);
    f.addEventListener('click', e => { if (e.target === f || e.target.closest('[data-fechar]')) fechar(); });
    if (montar) montar($('.modal', f), fechar);
    const foco = $('[autofocus]', f) || $('textarea, input:not([type=file]), select', f);
    if (foco) setTimeout(() => foco.focus(), 30);
    return fechar;
  }
  function confirmar(titulo, msg, ok, perigo) {
    return new Promise(res => {
      let r = false;
      modal('<h2>' + esc(titulo) + '</h2><p>' + msg + '</p><div class="rodape"><button class="btn" data-fechar>Voltar</button><button class="btn ' + (perigo ? 'perigo' : 'primario') + '" id="ok-c">' + esc(ok) + '</button></div>',
        (el, fechar) => { $('#ok-c', el).onclick = () => { r = true; fechar(); }; }, () => res(r));
    });
  }
  async function ocupado(btn, fn) {
    const html = btn.innerHTML; btn.disabled = true; btn.textContent = 'Enviando…';
    try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
  }
  function mostrarErro(el, sel, msg) { const p = $(sel, el); p.textContent = msg; p.hidden = false; }

  /** Lê uma foto do celular e reduz para no máximo 1280 px (JPEG), para subir rápido. */
  function reduzirFoto(arquivo) {
    return new Promise((res, rej) => {
      if (!arquivo || !/^image\//.test(arquivo.type)) return rej(new Error('Escolha um arquivo de imagem.'));
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const esc = Math.min(1, 1280 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        res(cv.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não foi possível ler essa imagem.')); };
      img.src = url;
    });
  }
  /** Campo de foto reutilizável: devolve um getter da foto escolhida. */
  function campoFoto(el, id, inicial, aoMudar) {
    let foto = inicial || null;
    const box = $('#' + id, el);
    const desenhar = () => {
      box.innerHTML = (foto ? '<img src="' + foto + '" alt="Foto escolhida">' : '') +
        '<label class="btn" for="' + id + '-in">' + ICON.camera + (foto ? 'Trocar foto' : 'Tirar ou escolher foto') + '</label>' +
        '<input type="file" id="' + id + '-in" accept="image/*" capture="environment">' +
        (foto ? '<button type="button" class="btn perigo" id="' + id + '-rm">Remover</button>' : '');
      $('#' + id + '-in', box).onchange = async e => {
        try { foto = await reduzirFoto(e.target.files[0]); desenhar(); if (aoMudar) aoMudar(); } catch (err) { toast(err.message, true); }
      };
      const rm = $('#' + id + '-rm', box); if (rm) rm.onclick = () => { foto = null; desenhar(); if (aoMudar) aoMudar(); };
    };
    desenhar();
    return () => foto;
  }

  function prazoInfo(c) {
    const s = R.situacaoPrazo(c, agora());
    if (!s) return { cls: '', txt: '' };
    if (s.encerrado) return s.vencido ? { cls: 'vencido', txt: 'Concluído fora do prazo' } : { cls: 'okp', txt: 'Concluído no prazo' };
    const total = R.URGENCIAS[c.urgencia].horas * 60;
    if (s.vencido) return { cls: 'vencido', txt: 'Vencido há ' + fmtDur(s.minutos), vencido: true };
    return { cls: s.minutos < total * 0.25 ? 'perto' : '', txt: 'Vence em ' + fmtDur(s.minutos) };
  }

  /* ===================== roteamento ===================== */
  const partes = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const ir = h => { if (location.hash === '#' + h) render(); else location.hash = h; };
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

  function render() {
    const app = $('#app');
    if (!st.sessao) { app.innerHTML = telaLogin(); montarLogin(); return; }
    if (!st.dados) {
      app.innerHTML = '<div class="login"><div class="wrap cartao"><img class="logo" src="logo-branco.png" alt="Viação Gato Preto"><p class="dica">Carregando chamados…</p></div></div>';
      carregar().then(render).catch(e => {
        app.innerHTML = '<div class="login"><div class="wrap cartao"><img class="logo" src="logo-branco.png" alt="Viação Gato Preto"><p class="dica">' + esc(e.message) + '</p>' +
          '<button class="btn amarelo grande" id="tentar">Tentar de novo</button><button class="btn" id="sair2">Sair</button></div></div>';
        $('#tentar').onclick = render; $('#sair2').onclick = sair;
      });
      return;
    }
    if (st.setor === null) st.setor = LS.get('setor:' + eu().id, eu().setor || 'Todos');
    const [r0, r1] = partes();
    let tela, nav = 'lista';
    if (r0 === 'novo') { tela = telaNovo(); nav = 'novo'; }
    else if (r0 === 'c') tela = telaDetalhe(r1);
    else if (r0 === 'admin' && ehAdmin()) { tela = telaAdmin(); nav = 'admin'; }
    else tela = telaLista();
    app.innerHTML = shell(tela.html, nav);
    $('#b-menu').onclick = menuUsuario;
    $('#b-atualizar').onclick = async () => { try { await carregar(); render(); toast('Atualizado'); } catch (e) { toast(e.message, true); } };
    if (tela.montar) tela.montar($('main'));
  }

  function shell(conteudo, nav) {
    const u = eu();
    const ini = u.nome.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    const a = (id, href, rot, ic, cls) => '<a href="#' + href + '"' + (cls ? ' class="' + cls + '"' : '') + (nav === id ? ' aria-current="page"' : '') + '>' + ic + '<span>' + rot + '</span></a>';
    return '<header class="topbar"><div class="wrap"><img class="logo" src="logo-branco.png" alt="Viação Gato Preto">' +
      '<span class="titulo">Chamados</span>' +
      '<button class="icone-btn" id="b-atualizar" aria-label="Atualizar">' + ICON.atualizar + '</button>' +
      '<button class="icone-btn" id="b-menu" aria-label="Menu de ' + esc(u.nome) + '">' + esc(ini) + '</button></div></header>' +
      (window.API.modoDemo ? '<div class="demo-faixa"><div class="wrap">Modo demonstração: chamados de exemplo, salvos só neste aparelho.</div></div>' : '') +
      '<main><div class="wrap">' + conteudo + '</div></main>' +
      '<nav class="nav" aria-label="Principal"><div class="wrap">' +
      a('lista', '/', 'Chamados', ICON.lista) +
      a('novo', '/novo', 'Abrir chamado', '<span class="bola">' + ICON.mais + '</span>', 'abrir') +
      (ehAdmin() ? a('admin', '/admin', 'Usuários', ICON.pessoas) : '') +
      '</div></nav>';
  }

  function menuUsuario() {
    const u = eu();
    modal('<h2>' + esc(u.nome) + '</h2><p class="eyebrow">' + (u.perfil === 'ADMIN' ? 'Administrador' : 'Usuário') + (u.setor ? ' · ' + esc(u.setor) : '') + '</p>' +
      '<div class="acoes" style="flex-direction:column"><button class="btn grande" id="m-pin">Trocar meu PIN</button>' +
      (window.API.modoDemo && ehAdmin() ? '<button class="btn grande" id="m-rest">Restaurar chamados de exemplo</button>' : '') +
      '<button class="btn grande perigo" id="m-sair">Sair</button></div><p class="ajuda">Versão do app: 1.1 (28/10/2026)</p><div class="rodape"><button class="btn" data-fechar>Fechar</button></div>',
      (el, fechar) => {
        $('#m-pin', el).onclick = () => { fechar(); modalPin(); };
        $('#m-sair', el).onclick = () => { fechar(); sair(); };
        const r = $('#m-rest', el);
        if (r) r.onclick = async () => { fechar(); window.DemoBackend.restaurar(); await carregar(); ir('/'); toast('Chamados de exemplo restaurados'); };
      });
  }
  function modalPin() {
    modal('<h2>Trocar meu PIN</h2><form id="f-pin" class="bloco" style="border:0;padding:0">' +
      '<div class="campo"><label for="p1">PIN atual</label><input id="p1" type="password" inputmode="numeric" autocomplete="current-password" required></div>' +
      '<div class="campo"><label for="p2">Novo PIN</label><input id="p2" type="password" inputmode="numeric" autocomplete="new-password" required><span class="ajuda">De 4 a 8 números.</span></div>' +
      '<p class="erro-form" id="p-erro" hidden></p><div class="rodape"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primario" id="p-ok">Salvar PIN</button></div></form>',
      (el, fechar) => {
        $('#f-pin', el).onsubmit = async e => {
          e.preventDefault();
          try { await ocupado($('#p-ok', el), () => api('trocarPin', { pinAtual: $('#p1', el).value, pinNovo: $('#p2', el).value })); fechar(); toast('PIN alterado'); }
          catch (err) { mostrarErro(el, '#p-erro', err.message); }
        };
      });
  }
  function sair() { st.sessao = null; st.dados = null; st.setor = null; LS.del('sessao'); LS.del('cache'); if (location.hash) location.hash = ''; render(); }

  /* ===================== login ===================== */
  function telaLogin() {
    return '<div class="login"><div class="wrap cartao"><img class="logo" src="logo-branco.png" alt="Viação Gato Preto">' +
      '<h1>Chamados de Manutenção</h1><form id="f-login">' +
      '<div class="campo"><label for="l-nome">Nome</label><input id="l-nome" autocomplete="username" value="' + esc(LS.get('ultimoNome', '')) + '" required></div>' +
      '<div class="campo"><label for="l-pin">PIN</label><input id="l-pin" class="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" required></div>' +
      '<p class="erro-form" id="l-erro" hidden></p><button class="btn primario grande" id="l-ok">Entrar</button></form>' +
      (window.API.modoDemo ? '<p class="dica">Demonstração: <b>Elton</b> (admin, 1234) · <b>Ana Souza</b> (0000) · <b>Marcos Lima</b>, da Equipe Predial (1111) · <b>Juliana Reis</b>, do TI (2222)</p>' : '') +
      '</div></div>';
  }
  function montarLogin() {
    const n = $('#l-nome'), p = $('#l-pin');
    (n.value ? p : n).focus();
    $('#f-login').onsubmit = async e => {
      e.preventDefault();
      const b = $('#l-ok'); b.disabled = true; b.textContent = 'Entrando…';
      try {
        st.sessao = await window.API.chamar('login', { nome: n.value, pin: p.value });
        LS.set('sessao', st.sessao); LS.set('ultimoNome', n.value.trim()); st.setor = null; render();
      } catch (err) { mostrarErro(document, '#l-erro', err.message); b.disabled = false; b.textContent = 'Entrar'; p.value = ''; p.focus(); }
    };
  }

  /* ===================== lista ===================== */
  function telaLista() {
    const todos = st.dados.chamados;
    const ativos = c => R.FINAIS.indexOf(c.status) < 0;
    const porSetor = c => st.setor === 'Todos' || c.setor === st.setor;
    const grupos = {
      fila: todos.filter(c => c.status === 'ABERTO' && porSetor(c)),
      comigo: todos.filter(c => R.EM_ATENDIMENTO.indexOf(c.status) >= 0 && meu('aceito_por', c)),
      meus: todos.filter(c => meu('aberto_por', c)),
      todos: todos.filter(c => porSetor(c)),
    };
    const confirmarPend = todos.filter(c => c.status === 'CONCLUIDO' && meu('aberto_por', c));
    const vencidos = todos.filter(c => ativos(c) && c.status !== 'CONCLUIDO' && prazoInfo(c).vencido && porSetor(c));
    const emAtend = todos.filter(c => R.EM_ATENDIMENTO.indexOf(c.status) >= 0 && porSetor(c));

    let lista = grupos[st.aba] || grupos.fila;
    if (st.aba === 'todos') {
      const f = st.statusTodos;
      lista = lista.filter(c => f === 'TUDO' || (f === 'ABERTOS' ? ativos(c) : f === 'VENCIDOS' ? vencidos.indexOf(c) >= 0 : f === 'EM_ATEND' ? R.EM_ATENDIMENTO.indexOf(c.status) >= 0 : c.status === f));
    }
    const q = st.busca.trim().toLowerCase();
    if (q) lista = lista.filter(c => (c.numero + ' ' + c.descricao + ' ' + c.local + ' ' + categoriaTxt(c) + ' ' + c.aberto_por + ' ' + c.aceito_por).toLowerCase().indexOf(q) >= 0);
    const ordemUrg = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
    lista = lista.slice().sort((a, b) => {
      const fa = R.FINAIS.indexOf(a.status) >= 0, fb = R.FINAIS.indexOf(b.status) >= 0;
      if (fa !== fb) return fa ? 1 : -1;
      if (fa) return String(b.atualizado_em).localeCompare(String(a.atualizado_em));
      return String(a.prazo).localeCompare(String(b.prazo)) || ordemUrg[a.urgencia] - ordemUrg[b.urgencia];
    });

    const aba = (id, rot) => '<button data-aba="' + id + '" aria-pressed="' + (st.aba === id) + '">' + rot + '<span class="n">' + (id === 'meus' ? grupos.meus.filter(ativos).length || grupos.meus.length : grupos[id].length) + '</span></button>';
    const usaSetor = st.aba === 'fila' || st.aba === 'todos';
    const setores = ['Todos'].concat(st.dados.listas.setores);
    const vazio = { fila: 'Nenhum chamado esperando aceite' + (st.setor !== 'Todos' ? ' em ' + esc(st.setor) : '') + '.', comigo: 'Você não está atendendo nenhum chamado agora. Os chamados que você aceitar aparecem aqui.', meus: 'Você ainda não abriu nenhum chamado. Use “Abrir chamado” lá embaixo.', todos: 'Nenhum chamado com esse filtro.' };

    return {
      html: '<section class="pagina">' +
        '<div class="cab"><div><div class="eyebrow">Olá, ' + esc(eu().nome.split(' ')[0]) + '</div><h1>Chamados</h1></div></div>' +
        (confirmarPend.length ? '<div class="aviso"><span>' + confirmarPend.length + ' chamado(s) seu(s) foram concluídos e esperam a sua confirmação.</span><button class="btn" id="b-ver-conf">Ver</button></div>' : '') +
        '<div class="resumo">' +
        '<button data-ir-aba="fila"><div class="v num">' + grupos.fila.length + '</div><div class="r">esperando aceite</div></button>' +
        '<button data-ir-aba="todos" data-status="EM_ATEND"><div class="v num">' + emAtend.length + '</div><div class="r">em atendimento</div></button>' +
        '<button class="' + (vencidos.length ? 'alerta' : '') + '" data-ir-aba="todos" data-status="VENCIDOS"><div class="v num">' + vencidos.length + '</div><div class="r">com prazo vencido</div></button></div>' +
        '<div class="abas" role="group" aria-label="Lista">' + aba('fila', 'Fila') + aba('comigo', 'Comigo') + aba('meus', 'Meus pedidos') + aba('todos', 'Todos') + '</div>' +
        (usaSetor ? '<div class="chips" aria-label="Setor">' + setores.map(s => '<button class="chip" data-setor="' + esc(s) + '" aria-pressed="' + (st.setor === s) + '">' + esc(s === 'Todos' ? 'Todos os setores' : s) + '</button>').join('') + '</div>' : '') +
        '<div class="filtros"><div class="busca"><input id="busca" type="search" placeholder="Buscar por número, local, descrição ou pessoa" value="' + esc(st.busca) + '" aria-label="Buscar"></div>' +
        (st.aba === 'todos' ? '<select id="f-status" aria-label="Situação"><option value="ABERTOS">Em aberto</option><option value="VENCIDOS">Prazo vencido</option><option value="EM_ATEND">Em atendimento (todos)</option>' +
          Object.keys(R.STATUS).map(k => '<option value="' + k + '">' + R.STATUS[k] + '</option>').join('') + '<option value="TUDO">Todas as situações</option></select>' : '') + '</div>' +
        '<div class="lista">' + (lista.length ? lista.map(cartao).join('') : '<div class="vazio">' + vazio[st.aba] + '</div>') + '</div></section>',
      montar(el) {
        $$('[data-aba]', el).forEach(b => b.onclick = () => { st.aba = b.dataset.aba; render(); });
        $$('[data-setor]', el).forEach(b => b.onclick = () => { st.setor = b.dataset.setor; LS.set('setor:' + eu().id, st.setor); render(); });
        $$('[data-ir-aba]', el).forEach(b => b.onclick = () => {
          st.aba = b.dataset.irAba;
          if (b.dataset.status === 'VENCIDOS') st.statusTodos = 'VENCIDOS';
          if (b.dataset.status === 'EM_ATEND') st.statusTodos = 'EM_ATEND';
          render();
        });
        const fs = $('#f-status', el); if (fs) { fs.value = st.statusTodos; fs.onchange = () => { st.statusTodos = fs.value; render(); }; }
        const bc = $('#b-ver-conf', el); if (bc) bc.onclick = () => { st.aba = 'meus'; render(); };
        const bu = $('#busca', el);
        bu.oninput = () => { st.busca = bu.value; const pos = bu.selectionStart; render(); const n = $('#busca'); n.focus(); n.setSelectionRange(pos, pos); };
      },
    };
  }

  function cartao(c) {
    const p = prazoInfo(c);
    const quem = c.status === 'ABERTO' ? 'Aberto por ' + esc(c.aberto_por) + ' ' + haQuanto(c.aberto_em)
      : R.EM_ATENDIMENTO.indexOf(c.status) >= 0 ? 'Com ' + esc(c.aceito_por)
        : c.status === 'CONCLUIDO' ? 'Concluído por ' + esc(c.concluido_por) + ' · falta confirmar'
          : c.status === 'ENCERRADO' ? 'Encerrado em ' + fmtDH(c.confirmado_em) : 'Cancelado por ' + esc(c.cancelado_por);
    return '<a class="cham ' + esc(c.urgencia) + '" href="#/c/' + encodeURIComponent(c.numero) + '">' +
      '<div class="top"><span class="nro">' + esc(c.numero) + '</span><span class="urg ' + esc(c.urgencia) + '">' + R.URGENCIAS[c.urgencia].rotulo + '</span>' +
      (c.reaberturas > 0 ? '<span class="urg ALTA">Reaberto</span>' : '') + '</div>' +
      '<span class="st ' + esc(c.status) + '">' + R.STATUS[c.status] + '</span>' +
      '<div class="desc">' + esc(c.descricao) + '</div>' +
      '<div class="meta"><span>' + ICON.setor + esc(categoriaTxt(c)) + ' → ' + esc(c.setor) + '</span>' +
      (c.local ? '<span>' + ICON.local + esc(c.local) + '</span>' : '') +
      (c.foto_abertura ? '<span>' + ICON.camera + 'foto</span>' : '') + '</div>' +
      '<div class="meta"><span>' + quem + '</span>' + (p.txt ? '<span class="prazo ' + p.cls + '">' + ICON.relogio + p.txt + '</span>' : '') + '</div></a>';
  }

  /* ===================== novo chamado ===================== */
  function telaNovo() {
    const L = st.dados.listas;
    return {
      html: '<section class="pagina"><div class="cab"><div><div class="eyebrow">Novo chamado</div><h1>Abrir chamado</h1>' +
        '<div class="sub">Será aberto em nome de <b>' + esc(eu().nome) + '</b>, com a data e a hora de agora.</div></div></div>' +
        '<form id="f-novo" class="bloco">' +
        '<div class="campo"><span class="rot">Que tipo de serviço?</span><div class="escolha" id="cats">' +
        L.categorias.map((c, i) => '<label><input type="radio" name="cat" value="' + esc(c.valor) + '" data-setor="' + esc(c.setor) + '"' + (i === 0 ? ' required' : '') + '><span>' + esc(c.valor) + '</span></label>').join('') + '</div></div>' +
        '<div class="campo" id="box-outro" hidden><label for="n-outro">Qual serviço?</label><input id="n-outro" maxlength="80" placeholder="Ex.: Persiana, bebedouro, portão"></div>' +
        '<div class="campo"><label for="n-setor">Setor responsável</label><select id="n-setor" required><option value="">Escolha o setor</option>' +
        L.setores.map(s => '<option>' + esc(s) + '</option>').join('') + '</select><span class="ajuda">Já sugerido pela categoria; troque se precisar.</span></div>' +
        '<div class="campo"><span class="rot">Urgência</span><div class="urgencias">' +
        Object.keys(R.URGENCIAS).map(k => '<label><input type="radio" name="urg" value="' + k + '"' + (k === 'MEDIA' ? ' checked' : '') + '><span>' + R.URGENCIAS[k].rotulo + '<small>até ' + fmtDur(R.URGENCIAS[k].horas * 60) + '</small></span></label>').join('') + '</div></div>' +
        '<div class="campo"><label for="n-local">Onde? (opcional)</label><input id="n-local" maxlength="120" placeholder="Ex.: Sala da Assessoria, 2º andar"></div>' +
        '<div class="campo"><label for="n-desc">O que está acontecendo?</label><textarea id="n-desc" required maxlength="1000" placeholder="Ex.: A lâmpada do teto está queimada e a sala fica escura à tarde."></textarea></div>' +
        '<div class="campo"><span class="rot">Foto (opcional)</span><div class="foto-campo" id="n-foto"></div></div>' +
        '<p class="erro-form" id="n-erro" hidden></p>' +
        '<div class="acoes"><button class="btn primario grande" id="n-ok">Abrir chamado</button><a class="btn grande" href="#/">Cancelar</a></div></form></section>',
      montar(el) {
        const chaveRasc = 'rascunho:' + eu().id;
        const rasc = LS.get(chaveRasc, null);
        let foto;
        const salvarRasc = () => {
          const cat = $('input[name=cat]:checked', el);
          const r = { cat: cat ? cat.value : '', outro: $('#n-outro', el).value, setor: $('#n-setor', el).value,
            urg: $('input[name=urg]:checked', el).value, local: $('#n-local', el).value, desc: $('#n-desc', el).value, foto: foto ? foto() : null };
          try { localStorage.setItem('chgp.' + chaveRasc, JSON.stringify(r)); }
          catch (e) { r.foto = null; LS.set(chaveRasc, r); } // sem espaço para a foto: guarda ao menos o texto
        };
        if (rasc) {
          const c = rasc.cat && $('input[name=cat][value="' + CSS.escape(rasc.cat) + '"]', el); if (c) c.checked = true;
          $('#box-outro', el).hidden = rasc.cat !== 'Outros';
          $('#n-outro', el).value = rasc.outro || ''; $('#n-setor', el).value = rasc.setor || '';
          const u = $('input[name=urg][value="' + (rasc.urg || 'MEDIA') + '"]', el); if (u) u.checked = true;
          $('#n-local', el).value = rasc.local || ''; $('#n-desc', el).value = rasc.desc || '';
          if (rasc.cat || rasc.desc || rasc.foto) toast('Recuperamos o que você estava preenchendo');
        }
        foto = campoFoto(el, 'n-foto', rasc && rasc.foto, salvarRasc);
        $('#f-novo', el).addEventListener('input', salvarRasc);
        $('#f-novo', el).addEventListener('change', salvarRasc);
        $('a[href="#/"].btn', el).addEventListener('click', () => LS.del(chaveRasc));
        $('#cats', el).onchange = e => {
          const r = e.target; if (r.name !== 'cat') return;
          $('#box-outro', el).hidden = r.value !== 'Outros';
          if (r.value === 'Outros') $('#n-outro', el).focus();
          if (r.dataset.setor) $('#n-setor', el).value = r.dataset.setor;
          salvarRasc();
        };
        $('#f-novo', el).onsubmit = async e => {
          e.preventDefault();
          const cat = $('input[name=cat]:checked', el);
          const dados = {
            categoria: cat ? cat.value : '', categoria_outro: $('#n-outro', el).value, setor: $('#n-setor', el).value,
            urgencia: $('input[name=urg]:checked', el).value, local: $('#n-local', el).value, descricao: $('#n-desc', el).value,
          };
          try {
            const c = await ocupado($('#n-ok', el), () => api('abrir', { chamado: dados, foto: foto() }));
            atualizarLocal(c); LS.del(chaveRasc); toast('Chamado ' + c.numero + ' aberto'); ir('/c/' + c.numero);
          } catch (err) { mostrarErro(el, '#n-erro', err.message); }
        };
      },
    };
  }

  /* ===================== detalhe ===================== */
  function telaDetalhe(numero) {
    const c = st.dados.chamados.find(x => x.numero === numero);
    if (!c) return { html: '<section class="pagina"><a class="voltar" href="#/">‹ Chamados</a><div class="vazio">Chamado não encontrado. Ele pode ter sido excluído ou estar encerrado há mais de 90 dias.</div></section>' };
    const p = prazoInfo(c);
    const acoes = R.acoesPermitidas(c, eu());
    const dd = (rot, val) => val ? '<div><dt>' + rot + '</dt><dd>' + val + '</dd></div>' : '';
    const BOTOES = {
      aceitar: ['primario', 'Aceitar chamado'], iniciar: ['', 'Iniciar atendimento'], aguardar: ['', 'Aguardando material'],
      concluir: ['verde', 'Concluir'], devolver: ['', 'Devolver para a fila'], confirmar: ['verde', 'Confirmar solução'],
      reabrir: ['amarelo', 'Não resolveu, reabrir'], cancelar: ['perigo', 'Cancelar chamado'],
    };
    const naBarra = acoes.filter(a => BOTOES[a]);
    return {
      html: '<section class="pagina' + (naBarra.length ? ' com-barra' : '') + '"><a class="voltar" href="#/">‹ Chamados</a>' +
        '<div class="cab"><div><div class="eyebrow"><span class="urg ' + esc(c.urgencia) + '">' + R.URGENCIAS[c.urgencia].rotulo + '</span> · ' + esc(categoriaTxt(c)) + '</div>' +
        '<h1>' + esc(c.numero) + '</h1></div><span class="st ' + esc(c.status) + '">' + R.STATUS[c.status] + '</span></div>' +
        '<div class="ficha"><p class="descricao">' + esc(c.descricao) + '</p>' +
        (c.status === 'AGUARDANDO_MATERIAL' && c.motivo_espera ? '<div class="espera">Aguardando material: ' + esc(c.motivo_espera) + '</div>' : '') +
        '<dl>' + dd('Setor responsável', esc(c.setor)) + dd('Local', esc(c.local)) +
        dd('Prazo', esc(fmtDH(c.prazo)) + (p.txt ? '<br><span class="prazo ' + p.cls + '">' + p.txt + '</span>' : '')) +
        dd('Aberto por', esc(c.aberto_por) + '<br><span class="sub">' + fmtDH(c.aberto_em) + '</span>') +
        dd('Aceito por', c.aceito_por ? esc(c.aceito_por) + '<br><span class="sub">' + fmtDH(c.aceito_em) + '</span>' : '') +
        dd('Concluído por', c.concluido_por ? esc(c.concluido_por) + '<br><span class="sub">' + fmtDH(c.concluido_em) + '</span>' : '') +
        dd('Confirmado por', c.confirmado_por ? esc(c.confirmado_por) + '<br><span class="sub">' + fmtDH(c.confirmado_em) + '</span>' : '') +
        dd('Reaberturas', c.reaberturas > 0 ? String(c.reaberturas) : '') +
        dd('Cancelado por', c.cancelado_por ? esc(c.cancelado_por) + '<br><span class="sub">' + esc(c.motivo_cancelamento) + '</span>' : '') +
        '</dl>' +
        (c.solucao ? '<div class="solucao"><b>Solução:</b> ' + esc(c.solucao) + '</div>' : '') +
        (c.foto_abertura || c.foto_solucao ? '<div class="fotos">' +
          (c.foto_abertura ? '<figure><button data-foto="' + esc(c.foto_abertura) + '">Carregando…</button><figcaption>Na abertura</figcaption></figure>' : '') +
          (c.foto_solucao ? '<figure><button data-foto="' + esc(c.foto_solucao) + '">Carregando…</button><figcaption>Serviço feito</figcaption></figure>' : '') + '</div>' : '') +
        (ehAdmin() ? '<div class="acoes"><button class="btn" id="b-editar">Editar</button><button class="btn perigo" id="b-excluir">Excluir</button></div>' : '') +
        '</div>' +
        '<div class="bloco"><h2 class="eyebrow">Linha do tempo</h2><ol class="linha-tempo" id="tempo"><li><div><div class="q">Carregando…</div></div></li></ol></div>' +
        (naBarra.length ? '<div class="barra-acoes"><div class="wrap">' + naBarra.map(a => '<button class="btn ' + BOTOES[a][0] + '" data-acao="' + a + '">' + BOTOES[a][1] + '</button>').join('') + '</div></div>' : '') +
        '</section>',
      montar(el) {
        // fotos
        $$('[data-foto]', el).forEach(async b => {
          const id = b.dataset.foto;
          try {
            if (!st.fotoCache[id]) st.fotoCache[id] = (await api('foto', { id })).dataUrl;
            b.innerHTML = '<img src="' + st.fotoCache[id] + '" alt="Foto do chamado">';
            b.onclick = () => { const z = document.createElement('div'); z.className = 'zoom'; z.innerHTML = '<img src="' + st.fotoCache[id] + '" alt="">'; z.onclick = () => z.remove(); document.body.appendChild(z); };
          } catch (e) { b.textContent = 'Foto indisponível'; }
        });
        // linha do tempo
        api('historico', { numero: c.numero }).then(h => {
          const ol = $('#tempo', el); if (!ol) return;
          ol.innerHTML = h.sort((a, b) => String(a.data_hora).localeCompare(String(b.data_hora))).map(x =>
            '<li><div><div class="q">' + fmtDH(x.data_hora) + '</div><b>' + esc(x.usuario) + '</b> ' + esc((R.ROTULO_ACAO[x.acao] || x.acao).toLowerCase()) +
            (x.detalhe && x.acao !== 'abrir' ? '<div class="d">' + esc(x.detalhe) + '</div>' : '') + '</div></li>').join('') || '<li><div class="q">Sem registros.</div></li>';
        }).catch(() => { const ol = $('#tempo', el); if (ol) ol.innerHTML = '<li><div class="q">Não foi possível carregar a linha do tempo.</div></li>'; });
        // ações
        $$('[data-acao]', el).forEach(b => b.onclick = () => executar(c, b.dataset.acao, b));
        const be = $('#b-editar', el); if (be) be.onclick = () => modalEditar(c);
        const bx = $('#b-excluir', el);
        if (bx) bx.onclick = async () => {
          if (!await confirmar('Excluir ' + c.numero + '?', 'O chamado some do app e da planilha, junto com as fotos. Para só encerrar, use “Cancelar chamado”. Isto não pode ser desfeito.', 'Excluir', true)) return;
          try { await api('excluir', { numero: c.numero }); st.dados.chamados = st.dados.chamados.filter(x => x.numero !== c.numero); toast(c.numero + ' excluído'); ir('/'); }
          catch (e) { toast(e.message, true); }
        };
      },
    };
  }

  async function enviarAcao(c, tipo, params, foto) {
    const novo = await api('acao', { numero: c.numero, tipo, params: params || {}, foto: foto || null });
    atualizarLocal(novo);
    return novo;
  }

  async function executar(c, tipo, btn) {
    const textos = {
      aguardar: ['Aguardando material', 'Qual material está faltando?', 'Ex.: Reator para lâmpada tubular 2x32 W', 'motivo', true],
      devolver: ['Devolver para a fila', 'O chamado volta para a fila e outra pessoa pode aceitar. Quer deixar um recado?', 'Ex.: Precisa de eletricista com escada grande', 'motivo', false],
      reabrir: ['Reabrir chamado', 'O que continua com problema?', 'Ex.: A lâmpada apagou de novo no dia seguinte', 'motivo', true],
      cancelar: ['Cancelar chamado', 'Por que este chamado vai ser cancelado?', 'Ex.: Aberto em duplicidade', 'motivo', true],
    };
    const ok = { aceitar: 'Você aceitou ' + c.numero, iniciar: 'Atendimento iniciado', aguardar: 'Marcado como aguardando material', devolver: 'Devolvido para a fila', concluir: 'Chamado concluído', confirmar: 'Solução confirmada. Chamado encerrado', reabrir: 'Chamado reaberto', cancelar: 'Chamado cancelado' };
    if (tipo === 'aceitar' || tipo === 'iniciar' || tipo === 'confirmar') {
      try { await ocupado(btn, () => enviarAcao(c, tipo)); toast(ok[tipo]); render(); } catch (e) { toast(e.message, true); await carregar().catch(() => {}); render(); }
      return;
    }
    if (tipo === 'concluir') {
      modal('<h2>Concluir ' + esc(c.numero) + '</h2><form id="f-ac" class="bloco" style="border:0;padding:0">' +
        '<div class="campo"><label for="a-sol">O que foi feito?</label><textarea id="a-sol" required maxlength="1000" placeholder="Ex.: Troquei a lâmpada e o reator."></textarea></div>' +
        '<div class="campo"><span class="rot">Foto do serviço pronto (opcional)</span><div class="foto-campo" id="a-foto"></div></div>' +
        '<p class="ajuda">Quem abriu o chamado vai confirmar se o problema foi resolvido.</p>' +
        '<p class="erro-form" id="a-erro" hidden></p><div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn verde" id="a-ok">Concluir</button></div></form>',
        (el, fechar) => {
          const foto = campoFoto(el, 'a-foto');
          $('#f-ac', el).onsubmit = async e => {
            e.preventDefault();
            try { await ocupado($('#a-ok', el), () => enviarAcao(c, 'concluir', { solucao: $('#a-sol', el).value }, foto())); fechar(); toast(ok.concluir); render(); }
            catch (err) { mostrarErro(el, '#a-erro', err.message); }
          };
        });
      return;
    }
    const [titulo, pergunta, ph, campo, obrig] = textos[tipo];
    modal('<h2>' + titulo + '</h2><form id="f-ac" class="bloco" style="border:0;padding:0"><div class="campo"><label for="a-txt">' + pergunta + '</label>' +
      '<textarea id="a-txt" maxlength="300" placeholder="' + esc(ph) + '"' + (obrig ? ' required' : '') + '></textarea></div>' +
      '<p class="erro-form" id="a-erro" hidden></p><div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn ' + (tipo === 'cancelar' ? 'perigo' : 'primario') + '" id="a-ok">' + titulo + '</button></div></form>',
      (el, fechar) => {
        $('#f-ac', el).onsubmit = async e => {
          e.preventDefault();
          try { await ocupado($('#a-ok', el), () => enviarAcao(c, tipo, { [campo]: $('#a-txt', el).value })); fechar(); toast(ok[tipo]); render(); }
          catch (err) { mostrarErro(el, '#a-erro', err.message); }
        };
      });
  }

  function modalEditar(c) {
    const L = st.dados.listas;
    modal('<h2>Editar ' + esc(c.numero) + '</h2><form id="f-ed" class="bloco" style="border:0;padding:0">' +
      '<div class="grade"><div class="campo"><label for="e-cat">Categoria</label><select id="e-cat">' + L.categorias.map(x => '<option' + (x.valor === c.categoria ? ' selected' : '') + '>' + esc(x.valor) + '</option>').join('') + '</select></div>' +
      '<div class="campo"><label for="e-setor">Setor responsável</label><select id="e-setor">' + L.setores.map(s => '<option' + (s === c.setor ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div></div>' +
      '<div class="campo" id="e-box-outro"' + (c.categoria === 'Outros' ? '' : ' hidden') + '><label for="e-outro">Qual serviço?</label><input id="e-outro" maxlength="80" value="' + esc(c.categoria_outro) + '"></div>' +
      '<div class="campo"><label for="e-urg">Urgência</label><select id="e-urg">' + Object.keys(R.URGENCIAS).map(k => '<option value="' + k + '"' + (k === c.urgencia ? ' selected' : '') + '>' + R.URGENCIAS[k].rotulo + ' (até ' + fmtDur(R.URGENCIAS[k].horas * 60) + ')</option>').join('') + '</select><span class="ajuda">Mudar a urgência recalcula o prazo a partir da abertura.</span></div>' +
      '<div class="campo"><label for="e-local">Local</label><input id="e-local" maxlength="120" value="' + esc(c.local) + '"></div>' +
      '<div class="campo"><label for="e-desc">Descrição</label><textarea id="e-desc" maxlength="1000">' + esc(c.descricao) + '</textarea></div>' +
      '<p class="erro-form" id="e-erro" hidden></p><div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn primario" id="e-ok">Salvar</button></div></form>',
      (el, fechar) => {
        $('#e-cat', el).onchange = e => { $('#e-box-outro', el).hidden = e.target.value !== 'Outros'; };
        $('#f-ed', el).onsubmit = async e => {
          e.preventDefault();
          const p = { categoria: $('#e-cat', el).value, categoria_outro: $('#e-outro', el).value, setor: $('#e-setor', el).value, urgencia: $('#e-urg', el).value, local: $('#e-local', el).value, descricao: $('#e-desc', el).value };
          try { await ocupado($('#e-ok', el), () => enviarAcao(c, 'editar', p)); fechar(); toast('Chamado atualizado'); render(); }
          catch (err) { mostrarErro(el, '#e-erro', err.message); }
        };
      });
  }

  /* ===================== admin: usuários ===================== */
  function telaAdmin() {
    const L = st.dados.listas;
    return {
      html: '<section class="pagina"><div class="cab"><div><div class="eyebrow">Administração</div><h1>Usuários</h1>' +
        '<div class="sub">Todo usuário pode abrir e aceitar chamados. O administrador também edita, exclui, cancela e cadastra pessoas.</div></div>' +
        '<button class="btn primario" id="b-novo-u">' + ICON.mais + 'Novo usuário</button></div>' +
        '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nome</th><th>Perfil</th><th>Setor</th><th>Situação</th></tr></thead><tbody id="tb-u"><tr><td colspan="4">Carregando…</td></tr></tbody></table></div>' +
        '<div class="bloco"><h2 class="eyebrow">Setores e categorias</h2><p class="sub">Para incluir ou mudar, edite a aba <b>Listas</b> da planilha (tipo SETOR ou CATEGORIA; na categoria, a coluna setor_padrao é o setor sugerido).</p>' +
        '<p><b>Setores:</b> ' + L.setores.map(esc).join(' · ') + '</p><p><b>Categorias:</b> ' + L.categorias.map(c => esc(c.valor)).join(' · ') + '</p></div></section>',
      montar(el) {
        let lista = [];
        const carregarU = () => api('listarUsuarios').then(us => {
          lista = us.sort((a, b) => a.nome.localeCompare(b.nome));
          const tb = $('#tb-u', el); if (!tb) return;
          tb.innerHTML = lista.map(u => '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.nome) + '</b></td><td>' + (u.perfil === 'ADMIN' ? 'Administrador' : 'Usuário') + '</td><td>' + esc(u.setor || '—') + '</td>' +
            '<td><span class="st ' + (u.ativo ? 'CONCLUIDO' : 'CANCELADO') + '">' + (u.ativo ? 'Ativo' : 'Bloqueado') + '</span></td></tr>').join('');
        }).catch(e => toast(e.message, true));
        carregarU();
        const editar = u => modal('<h2>' + (u ? 'Editar usuário' : 'Novo usuário') + '</h2><form id="f-u" class="bloco" style="border:0;padding:0">' +
          '<div class="campo"><label for="u-nome">Nome</label><input id="u-nome" required value="' + esc(u ? u.nome : '') + '"><span class="ajuda">É o nome que a pessoa digita para entrar e que aparece nos chamados.</span></div>' +
          '<div class="grade"><div class="campo"><label for="u-perfil">Perfil</label><select id="u-perfil"><option value="USUARIO">Usuário</option><option value="ADMIN"' + (u && u.perfil === 'ADMIN' ? ' selected' : '') + '>Administrador</option></select></div>' +
          '<div class="campo"><label for="u-setor">Setor (opcional)</label><select id="u-setor"><option value="">Nenhum</option>' + L.setores.map(s => '<option' + (u && u.setor === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div></div>' +
          '<p class="ajuda">O setor só define qual fila a pessoa vê primeiro.</p>' +
          '<div class="campo"><label for="u-pin">' + (u ? 'Novo PIN (vazio = manter)' : 'PIN') + '</label><input id="u-pin" inputmode="numeric" autocomplete="off"' + (u ? '' : ' required') + '><span class="ajuda">De 4 a 8 números.</span></div>' +
          (u ? '<label class="chip" style="align-self:flex-start"><input type="checkbox" id="u-ativo"' + (u.ativo ? ' checked' : '') + '> Pode entrar no app</label>' : '') +
          '<p class="erro-form" id="u-erro" hidden></p><div class="rodape"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primario" id="u-ok">Salvar</button></div></form>',
          (m, fechar) => {
            $('#f-u', m).onsubmit = async e => {
              e.preventDefault();
              try {
                await ocupado($('#u-ok', m), () => api('salvarUsuario', { id: u && u.id, nome: $('#u-nome', m).value, perfil: $('#u-perfil', m).value, setor: $('#u-setor', m).value, pin: $('#u-pin', m).value, ativo: u ? $('#u-ativo', m).checked : true }));
                fechar(); toast('Usuário salvo'); carregarU();
              } catch (err) { mostrarErro(m, '#u-erro', err.message); }
            };
          });
        $('#b-novo-u', el).onclick = () => editar(null);
        $('#tb-u', el).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) editar(lista.find(u => String(u.id) === tr.dataset.id)); };
      },
    };
  }

  /* ===================== início ===================== */
  function iniciar() {
    if (st.sessao) {
      const cache = LS.get('cache', null);
      if (cache && cache.usuario === st.sessao.usuario.id) { st.dados = cache.dados; setTimeout(() => carregar(true), 50); }
    }
    render();
    // Atualiza sozinho a cada minuto enquanto o app está aberto na tela
    setInterval(() => { if (st.sessao && st.dados && document.visibilityState === 'visible') carregar(true); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && st.sessao && st.dados) carregar(true); });
    if ('serviceWorker' in navigator && /^https:|^http:\/\/localhost/.test(location.href)) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  iniciar();
})();
