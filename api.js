/* Acesso ao backend (Apps Script) — ou ao backend de demonstração quando API_URL está vazio. */
(function () {
  const cfg = window.APP_CONFIG || {};
  const modoDemo = !cfg.API_URL;
  async function servidor(acao, dados, token) {
    let r;
    try {
      // text/plain evita a requisição "preflight" de CORS, que o Apps Script não responde.
      r = await fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao, token, dados: dados || {} }), redirect: 'follow' });
    } catch (e) { throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.'); }
    if (!r.ok) throw new Error('O servidor respondeu com erro (' + r.status + ').');
    const j = await r.json();
    if (!j.ok) throw new Error(j.erro || 'Erro desconhecido.');
    return j.data;
  }
  window.API = { modoDemo, chamar: (acao, dados, token) => modoDemo ? window.DemoBackend.chamar(acao, dados, token) : servidor(acao, dados, token) };
})();
