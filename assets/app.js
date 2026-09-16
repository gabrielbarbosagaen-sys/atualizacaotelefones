(function () {
  const { url, anonKey } = window.SUPABASE_CONFIG;
  const sb = window.supabase.createClient(url, anonKey);

  const nomeGestorEl = document.getElementById("nomeGestor");
  const buscaEl = document.getElementById("busca");
  const filtroLojaEl = document.getElementById("filtroLoja");
  const filtroDepEl = document.getElementById("filtroDepartamento");
  const listaEl = document.getElementById("listaColaboradores");

  // Lembrar o nome do gestor entre visitas (conveniência, não é autenticação).
  nomeGestorEl.value = localStorage.getItem("nomeGestor") || "";
  nomeGestorEl.addEventListener("input", () => {
    localStorage.setItem("nomeGestor", nomeGestorEl.value);
  });

  const painel = criarPainelProgresso(sb, {
    elResumoTotal: document.getElementById("resumoTotal"),
    elResumoPreenchido: document.getElementById("resumoPreenchido"),
    elResumoPendente: document.getElementById("resumoPendente"),
    elResumoPct: document.getElementById("resumoPct"),
    canvasLojas: document.getElementById("graficoLojas"),
    canvasDetalhe: document.getElementById("graficoDetalhe"),
    selectLojaDetalhe: document.getElementById("selectLojaDetalhe"),
  });

  async function carregarFiltros() {
    const { data, error } = await sb.from("colaboradores_busca").select("filial, departamento");
    if (error) {
      console.error(error);
      return;
    }
    const lojas = [...new Set(data.map((d) => d.filial))].sort();
    const deps = [...new Set(data.map((d) => d.departamento))].sort();
    filtroLojaEl.innerHTML =
      '<option value="">Todas as lojas</option>' + lojas.map((l) => `<option>${l}</option>`).join("");
    filtroDepEl.innerHTML =
      '<option value="">Todos os departamentos</option>' + deps.map((d) => `<option>${d}</option>`).join("");
  }

  function limparDigitos(v, max) {
    return v.replace(/\D/g, "").slice(0, max);
  }

  function linhaColaborador(c) {
    const div = document.createElement("div");
    div.className = "colaborador" + (c.preenchido ? " preenchido" : "");
    div.innerHTML = `
      <div class="info">
        <div class="nome">${c.nome}</div>
        <div class="meta">Crachá ${c.cadastro} · ${c.filial} · ${c.departamento}</div>
        <span class="badge">${c.preenchido ? "Preenchido" : "Pendente"}</span>
      </div>
      <div>
        <div class="tel-campos">
          <input type="text" class="ddd" inputmode="numeric" placeholder="DDD" maxlength="2" />
          <span class="sep">(</span>
          <input type="text" class="parte1" inputmode="numeric" placeholder="0000/00000" maxlength="5" />
          <span class="sep">-</span>
          <input type="text" class="parte2" inputmode="numeric" placeholder="0000" maxlength="4" />
          <button class="salvar">${c.preenchido ? "Atualizar" : "Salvar"}</button>
        </div>
        <div class="msg-linha"></div>
      </div>
    `;

    const dddEl = div.querySelector(".ddd");
    const p1El = div.querySelector(".parte1");
    const p2El = div.querySelector(".parte2");
    const btn = div.querySelector(".salvar");
    const msgEl = div.querySelector(".msg-linha");

    dddEl.addEventListener("input", () => (dddEl.value = limparDigitos(dddEl.value, 2)));
    p1El.addEventListener("input", () => (p1El.value = limparDigitos(p1El.value, 5)));
    p2El.addEventListener("input", () => (p2El.value = limparDigitos(p2El.value, 4)));

    btn.addEventListener("click", async () => {
      msgEl.className = "msg-linha";
      msgEl.textContent = "";

      const gestor = nomeGestorEl.value.trim();
      if (!gestor) {
        nomeGestorEl.focus();
        msgEl.className = "msg-linha erro";
        msgEl.textContent = "Informe seu nome (gestor) no topo do formulário antes de salvar.";
        return;
      }

      const telefone = dddEl.value + p1El.value + p2El.value;
      if (telefone.length < 10 || telefone.length > 11) {
        msgEl.className = "msg-linha erro";
        msgEl.textContent = "Telefone incompleto. Confira DDD + número.";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Salvando...";
      const { error } = await sb.rpc("salvar_telefone", {
        p_cadastro: c.cadastro,
        p_telefone: telefone,
        p_preenchido_por: gestor,
      });

      if (error) {
        msgEl.className = "msg-linha erro";
        msgEl.textContent = error.message || "Erro ao salvar.";
        btn.disabled = false;
        btn.textContent = c.preenchido ? "Atualizar" : "Salvar";
        return;
      }

      c.preenchido = true;
      div.classList.add("preenchido");
      div.querySelector(".badge").textContent = "Preenchido";
      msgEl.className = "msg-linha ok";
      msgEl.textContent = "Salvo com sucesso!";
      btn.disabled = false;
      btn.textContent = "Atualizar";
      dddEl.value = "";
      p1El.value = "";
      p2El.value = "";
      painel.atualizar();
    });

    return div;
  }

  let controleBusca = 0;
  async function buscar() {
    const termo = buscaEl.value.trim();
    const loja = filtroLojaEl.value;
    const dep = filtroDepEl.value;

    if (!termo && !loja && !dep) {
      listaEl.innerHTML = '<div class="vazio">Digite um nome/crachá ou escolha uma loja/departamento para começar.</div>';
      return;
    }

    const idBusca = ++controleBusca;
    listaEl.innerHTML = '<div class="carregando">Buscando...</div>';

    let query = sb.from("colaboradores_busca").select("cadastro, nome, filial, departamento, preenchido").order("nome").limit(100);
    if (loja) query = query.eq("filial", loja);
    if (dep) query = query.eq("departamento", dep);
    if (termo) {
      const somenteDigitos = termo.replace(/\D/g, "");
      if (somenteDigitos && somenteDigitos === termo) {
        query = query.eq("cadastro", Number(somenteDigitos));
      } else {
        query = query.ilike("nome", `%${termo}%`);
      }
    }

    const { data, error } = await query;
    if (idBusca !== controleBusca) return; // resposta antiga, ignore

    if (error) {
      listaEl.innerHTML = `<div class="vazio">Erro ao buscar: ${error.message}</div>`;
      return;
    }
    if (!data.length) {
      listaEl.innerHTML = '<div class="vazio">Nenhum colaborador encontrado.</div>';
      return;
    }

    listaEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    data.forEach((c) => frag.appendChild(linhaColaborador(c)));
    listaEl.appendChild(frag);
  }

  let timeoutBusca = null;
  function buscarComDebounce() {
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(buscar, 300);
  }
  buscaEl.addEventListener("input", buscarComDebounce);
  filtroLojaEl.addEventListener("change", buscar);
  filtroDepEl.addEventListener("change", buscar);

  // Atualiza o gráfico em tempo real quando qualquer gestor salvar um telefone.
  sb.channel("colaboradores-changes")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "colaboradores" }, () => {
      painel.atualizar();
    })
    .subscribe();

  carregarFiltros();
  painel.atualizar();
})();
