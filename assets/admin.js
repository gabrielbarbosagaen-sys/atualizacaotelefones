(function () {
  const { url, anonKey } = window.SUPABASE_CONFIG;
  const sb = window.supabase.createClient(url, anonKey);

  const telaLogin = document.getElementById("telaLogin");
  const telaAdmin = document.getElementById("telaAdmin");
  const senhaInput = document.getElementById("senhaInput");
  const btnEntrar = document.getElementById("btnEntrar");
  const loginErro = document.getElementById("loginErro");
  const corpoTabela = document.getElementById("corpoTabela");
  const btnBaixar = document.getElementById("btnBaixar");
  const btnAtualizarDados = document.getElementById("btnAtualizarDados");

  let dadosAtuais = [];
  let painel = null;

  // O Supabase limita cada requisição a no máximo 1000 linhas; com mais de
  // 2000 colaboradores, buscamos em lotes até não haver mais dados.
  async function buscarTodosDados(senha) {
    const TAMANHO_LOTE = 1000;
    let offset = 0;
    let tudo = [];
    while (true) {
      const { data, error } = await sb
        .rpc("exportar_dados", { p_senha: senha })
        .range(offset, offset + TAMANHO_LOTE - 1);
      if (error) throw error;
      tudo = tudo.concat(data || []);
      if (!data || data.length < TAMANHO_LOTE) break;
      offset += TAMANHO_LOTE;
    }
    return tudo;
  }

  // A checagem de senha de verdade acontece dentro do Supabase (função
  // exportar_dados), não aqui no navegador — isso é só a tela.
  async function entrar() {
    loginErro.textContent = "";
    const senha = senhaInput.value.trim();
    if (!senha) return;

    btnEntrar.disabled = true;
    btnEntrar.textContent = "Verificando...";

    let data;
    try {
      data = await buscarTodosDados(senha);
    } catch (error) {
      btnEntrar.disabled = false;
      btnEntrar.textContent = "Entrar";
      loginErro.textContent = error.message || "Senha incorreta.";
      return;
    }

    btnEntrar.disabled = false;
    btnEntrar.textContent = "Entrar";

    dadosAtuais = data || [];
    telaLogin.style.display = "none";
    telaAdmin.style.display = "block";
    renderizarTabela(dadosAtuais);

    if (!painel) {
      painel = criarPainelProgresso(sb, {
        elResumoTotal: document.getElementById("resumoTotal"),
        elResumoPreenchido: document.getElementById("resumoPreenchido"),
        elResumoPendente: document.getElementById("resumoPendente"),
        elResumoPct: document.getElementById("resumoPct"),
        canvasLojas: document.getElementById("graficoLojas"),
        canvasDetalhe: document.getElementById("graficoDetalhe"),
        selectLojaDetalhe: document.getElementById("selectLojaDetalhe"),
      });
    }
    painel.atualizar();
  }

  btnEntrar.addEventListener("click", entrar);
  senhaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") entrar();
  });

  function renderizarTabela(linhas) {
    corpoTabela.innerHTML = linhas
      .map(
        (l) => `
        <tr>
          <td>${l.cadastro}</td>
          <td>${l.nome}</td>
          <td>${l.filial}</td>
          <td>${l.departamento}</td>
          <td>${l.telefone || ""}</td>
          <td>${l.preenchido_por || ""}</td>
          <td>${l.atualizado_em ? new Date(l.atualizado_em).toLocaleString("pt-BR") : ""}</td>
        </tr>`
      )
      .join("");
  }

  btnAtualizarDados.addEventListener("click", async () => {
    const senha = senhaInput.value.trim();
    try {
      dadosAtuais = await buscarTodosDados(senha);
    } catch (error) {
      alert("Não foi possível atualizar: " + error.message);
      return;
    }
    renderizarTabela(dadosAtuais);
    if (painel) painel.atualizar();
  });

  btnBaixar.addEventListener("click", () => {
    const linhas = dadosAtuais.map((l) => ({
      Cadastro: l.cadastro,
      Nome: l.nome,
      Filial: l.filial,
      Departamento: l.departamento,
      Telefone: l.telefone || "",
      "Preenchido por": l.preenchido_por || "",
      "Atualizado em": l.atualizado_em ? new Date(l.atualizado_em).toLocaleString("pt-BR") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
    const dataStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `telefones_colaboradores_${dataStr}.xlsx`);
  });
})();
