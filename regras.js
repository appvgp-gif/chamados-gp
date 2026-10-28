/**
 * Regras do sistema de chamados — o MESMO arquivo roda no Apps Script (como Regras.gs)
 * e no navegador (como regras.js, no modo demonstração). Não acessa planilha nem tela:
 * só recebe dados, valida e devolve o chamado alterado.
 *
 * Datas são texto "AAAA-MM-DD HH:MM" no horário de Brasília.
 */
var Regras = (function () {
  var URGENCIAS = {
    URGENTE: { rotulo: 'Urgente', horas: 4 },
    ALTA: { rotulo: 'Alta', horas: 24 },
    MEDIA: { rotulo: 'Média', horas: 72 },
    BAIXA: { rotulo: 'Baixa', horas: 168 },
  };
  var STATUS = {
    ABERTO: 'Aberto',
    ACEITO: 'Aceito',
    EM_ANDAMENTO: 'Em andamento',
    AGUARDANDO_MATERIAL: 'Aguardando material',
    CONCLUIDO: 'Concluído',
    ENCERRADO: 'Encerrado',
    CANCELADO: 'Cancelado',
  };
  var EM_ATENDIMENTO = ['ACEITO', 'EM_ANDAMENTO', 'AGUARDANDO_MATERIAL'];
  var FINAIS = ['CONCLUIDO', 'ENCERRADO', 'CANCELADO'];
  var CAMPOS = ['numero', 'status', 'urgencia', 'categoria', 'categoria_outro', 'setor', 'local', 'descricao', 'foto_abertura',
    'aberto_em', 'aberto_por', 'prazo', 'aceito_em', 'aceito_por', 'motivo_espera', 'concluido_em', 'concluido_por', 'solucao',
    'foto_solucao', 'confirmado_em', 'confirmado_por', 'reaberturas', 'cancelado_em', 'cancelado_por', 'motivo_cancelamento', 'atualizado_em'];

  function erro(msg) { throw new Error(msg); }
  function txt(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }
  function mesmo(a, b) {
    var n = function (s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); };
    return n(a) === n(b);
  }

  /* --- datas como texto, sem depender do fuso do servidor --- */
  function paraMs(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
  }
  function deMs(ms) {
    var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }
  function somarHoras(s, h) { return deMs(paraMs(s) + h * 3600000); }

  /** Situação do prazo: {vencido, minutos} — minutos até o prazo (negativo = atrasado). */
  function situacaoPrazo(c, agora) {
    if (!c.prazo || c.status === 'CANCELADO') return null;
    var feito = c.status === 'CONCLUIDO' || c.status === 'ENCERRADO';
    var min = Math.round((paraMs(c.prazo) - paraMs(feito ? c.concluido_em : agora)) / 60000);
    return { vencido: min < 0, minutos: min, encerrado: feito };
  }

  function proximoNumero(chamados, agora) {
    var ano = String(agora).slice(0, 4), max = 0;
    chamados.forEach(function (c) {
      var m = /^CH-(\d{4})-(\d+)$/.exec(c.numero || '');
      if (m && m[1] === ano) max = Math.max(max, +m[2]);
    });
    return 'CH-' + ano + '-' + ('000' + (max + 1)).slice(-4);
  }

  /** Cria um chamado novo. dados: {categoria, categoria_outro, setor, urgencia, local, descricao} */
  function abrir(dados, user, agora, chamados, listas) {
    var cat = txt(dados.categoria, 60), setor = txt(dados.setor, 60);
    if (!cat) erro('Escolha a categoria do serviço.');
    if (listas && listas.categorias.length && !listas.categorias.some(function (x) { return x.valor === cat; })) erro('Categoria inválida.');
    var outro = txt(dados.categoria_outro, 80);
    if (cat === 'Outros' && !outro) erro('Diga qual é o serviço em “Outros”.');
    if (!setor) erro('Escolha o setor responsável.');
    if (listas && listas.setores.length && listas.setores.indexOf(setor) < 0) erro('Setor inválido.');
    if (!URGENCIAS[dados.urgencia]) erro('Escolha o nível de urgência.');
    var desc = txt(dados.descricao, 1000);
    if (desc.length < 5) erro('Descreva o problema.');
    var c = {};
    CAMPOS.forEach(function (k) { c[k] = ''; });
    c.numero = proximoNumero(chamados, agora);
    c.status = 'ABERTO';
    c.urgencia = dados.urgencia;
    c.categoria = cat;
    c.categoria_outro = cat === 'Outros' ? outro : '';
    c.setor = setor;
    c.local = txt(dados.local, 120);
    c.descricao = desc;
    c.aberto_em = agora;
    c.aberto_por = user.nome;
    c.prazo = somarHoras(agora, URGENCIAS[dados.urgencia].horas);
    c.reaberturas = 0;
    c.atualizado_em = agora;
    return c;
  }

  /** Quais ações este usuário pode fazer neste chamado agora. */
  function acoesPermitidas(c, user) {
    var admin = user.perfil === 'ADMIN';
    var resp = mesmo(c.aceito_por, user.nome);
    var autor = mesmo(c.aberto_por, user.nome);
    var a = [];
    if (c.status === 'ABERTO') {
      a.push('aceitar');
      if (autor || admin) a.push('cancelar');
    }
    if (EM_ATENDIMENTO.indexOf(c.status) >= 0 && (resp || admin)) {
      if (c.status !== 'EM_ANDAMENTO') a.push('iniciar');
      if (c.status !== 'AGUARDANDO_MATERIAL') a.push('aguardar');
      a.push('concluir', 'devolver');
      if (admin) a.push('cancelar');
    }
    if (c.status === 'CONCLUIDO' && (autor || admin)) a.push('confirmar', 'reabrir');
    if (admin) a.push('editar', 'excluir');
    return a;
  }

  var ROTULO_ACAO = {
    aceitar: 'Aceitou o chamado', iniciar: 'Iniciou o atendimento', aguardar: 'Aguardando material', devolver: 'Devolveu para a fila',
    concluir: 'Concluiu o chamado', confirmar: 'Confirmou a solução', reabrir: 'Reabriu o chamado', cancelar: 'Cancelou o chamado',
    editar: 'Editou o chamado', abrir: 'Abriu o chamado', excluir: 'Excluiu o chamado',
  };

  /**
   * Aplica uma ação. Devolve {chamado, detalhe} — chamado é uma cópia alterada.
   * p: parâmetros da ação (motivo, solucao, foto_solucao, campos de edição).
   */
  function aplicar(original, tipo, p, user, agora, listas) {
    p = p || {};
    if (acoesPermitidas(original, user).indexOf(tipo) < 0) {
      erro(tipo === 'aceitar' ? 'Este chamado já foi aceito por outra pessoa.' : 'Você não pode fazer isso neste chamado agora.');
    }
    var c = {};
    Object.keys(original).forEach(function (k) { c[k] = original[k]; });
    var detalhe = '';
    switch (tipo) {
      case 'aceitar':
        c.status = 'ACEITO'; c.aceito_em = agora; c.aceito_por = user.nome; break;
      case 'iniciar':
        c.status = 'EM_ANDAMENTO'; c.motivo_espera = ''; break;
      case 'aguardar':
        detalhe = txt(p.motivo, 300);
        if (!detalhe) erro('Diga qual material está faltando.');
        c.status = 'AGUARDANDO_MATERIAL'; c.motivo_espera = detalhe; break;
      case 'devolver':
        detalhe = txt(p.motivo, 300);
        c.status = 'ABERTO'; c.aceito_em = ''; c.aceito_por = ''; c.motivo_espera = ''; break;
      case 'concluir':
        detalhe = txt(p.solucao, 1000);
        if (detalhe.length < 3) erro('Descreva o que foi feito.');
        c.status = 'CONCLUIDO'; c.concluido_em = agora; c.concluido_por = user.nome; c.solucao = detalhe; c.motivo_espera = '';
        if (p.foto_solucao) c.foto_solucao = p.foto_solucao;
        break;
      case 'confirmar':
        c.status = 'ENCERRADO'; c.confirmado_em = agora; c.confirmado_por = user.nome; break;
      case 'reabrir':
        detalhe = txt(p.motivo, 300);
        if (!detalhe) erro('Explique por que o problema não foi resolvido.');
        c.status = 'EM_ANDAMENTO'; c.concluido_em = ''; c.concluido_por = ''; c.solucao = ''; c.foto_solucao = ''; c.reaberturas = (Number(c.reaberturas) || 0) + 1; break;
      case 'cancelar':
        detalhe = txt(p.motivo, 300);
        if (!detalhe) erro('Diga o motivo do cancelamento.');
        c.status = 'CANCELADO'; c.cancelado_em = agora; c.cancelado_por = user.nome; c.motivo_cancelamento = detalhe; break;
      case 'editar':
        var mud = [];
        ['categoria', 'categoria_outro', 'setor', 'urgencia', 'local', 'descricao'].forEach(function (k) {
          if (p[k] === undefined) return;
          var v = k === 'urgencia' ? p[k] : txt(p[k], k === 'descricao' ? 1000 : 120);
          if (String(v) !== String(c[k])) { mud.push(k); c[k] = v; }
        });
        if (!URGENCIAS[c.urgencia]) erro('Urgência inválida.');
        if (listas && listas.setores.length && listas.setores.indexOf(c.setor) < 0) erro('Setor inválido.');
        if (c.categoria !== 'Outros') c.categoria_outro = '';
        if (mud.indexOf('urgencia') >= 0) c.prazo = somarHoras(c.aberto_em, URGENCIAS[c.urgencia].horas);
        detalhe = mud.length ? 'Alterou: ' + mud.join(', ') : 'Sem alterações';
        break;
      default:
        erro('Ação desconhecida.');
    }
    c.atualizado_em = agora;
    return { chamado: c, detalhe: detalhe };
  }

  return {
    URGENCIAS: URGENCIAS, STATUS: STATUS, EM_ATENDIMENTO: EM_ATENDIMENTO, FINAIS: FINAIS, CAMPOS: CAMPOS, ROTULO_ACAO: ROTULO_ACAO,
    abrir: abrir, aplicar: aplicar, acoesPermitidas: acoesPermitidas, situacaoPrazo: situacaoPrazo,
    somarHoras: somarHoras, paraMs: paraMs, deMs: deMs, mesmo: mesmo,
  };
})();
if (typeof window !== 'undefined') window.Regras = Regras;
