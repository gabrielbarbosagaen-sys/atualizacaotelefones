// Lógica compartilhada do gráfico de progresso (usada na tela do gestor e no admin).

async function buscarProgresso(sb) {
  const { data, error } = await sb.rpc("progresso");
  if (error) throw error;
  return data || [];
}

function agregarPorLoja(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const atual = mapa.get(l.filial) || { total: 0, preenchidos: 0 };
    atual.total += Number(l.total);
    atual.preenchidos += Number(l.preenchidos);
    mapa.set(l.filial, atual);
  }
  return mapa;
}

function montarDatasetsStacked(labels, totais, preenchidos) {
  const pendentes = totais.map((t, i) => t - preenchidos[i]);
  return {
    labels,
    datasets: [
      {
        label: "Preenchidos",
        data: preenchidos,
        backgroundColor: "#1f9d55",
        stack: "s",
      },
      {
        label: "Pendentes",
        data: pendentes,
        backgroundColor: "#c9d2d8",
        stack: "s",
      },
    ],
  };
}

function opcoesGrafico() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" },
      tooltip: {
        callbacks: {
          afterLabel: (ctx) => {
            const total = ctx.chart.data.datasets.reduce(
              (s, d) => s + d.data[ctx.dataIndex],
              0
            );
            const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
            return `${pct}% do total`;
          },
        },
      },
    },
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
    },
  };
}

// Renderiza o painel completo (resumo numérico + gráfico por loja + detalhe por
// departamento de uma loja selecionada) dentro do container informado.
// Retorna uma função `atualizar()` que pode ser chamada de novo (ex: realtime).
function criarPainelProgresso(sb, elementos) {
  const { elResumoTotal, elResumoPreenchido, elResumoPendente, elResumoPct,
          canvasLojas, canvasDetalhe, selectLojaDetalhe } = elementos;

  let chartLojas = null;
  let chartDetalhe = null;
  let ultimoDado = [];

  function preencherSelectLojas(linhas) {
    const lojas = [...new Set(linhas.map((l) => l.filial))].sort();
    const valorAtual = selectLojaDetalhe.value;
    selectLojaDetalhe.innerHTML =
      '<option value="">Todas as lojas (somatório)</option>' +
      lojas.map((f) => `<option value="${f}">${f}</option>`).join("");
    if (lojas.includes(valorAtual)) selectLojaDetalhe.value = valorAtual;
  }

  function desenharGraficoLojas(linhas) {
    const porLoja = agregarPorLoja(linhas);
    const labels = [...porLoja.keys()].sort();
    const totais = labels.map((l) => porLoja.get(l).total);
    const preenchidos = labels.map((l) => porLoja.get(l).preenchidos);
    const dados = montarDatasetsStacked(labels, totais, preenchidos);

    if (chartLojas) {
      chartLojas.data = dados;
      chartLojas.update();
    } else {
      chartLojas = new Chart(canvasLojas, { type: "bar", data: dados, options: opcoesGrafico() });
    }
  }

  function desenharGraficoDetalhe(linhas, lojaFiltro) {
    const filtradas = lojaFiltro ? linhas.filter((l) => l.filial === lojaFiltro) : linhas;
    const porDep = new Map();
    for (const l of filtradas) {
      const atual = porDep.get(l.departamento) || { total: 0, preenchidos: 0 };
      atual.total += Number(l.total);
      atual.preenchidos += Number(l.preenchidos);
      porDep.set(l.departamento, atual);
    }
    const labels = [...porDep.keys()].sort();
    const totais = labels.map((d) => porDep.get(d).total);
    const preenchidos = labels.map((d) => porDep.get(d).preenchidos);
    const dados = montarDatasetsStacked(labels, totais, preenchidos);

    if (chartDetalhe) {
      chartDetalhe.data = dados;
      chartDetalhe.update();
    } else {
      chartDetalhe = new Chart(canvasDetalhe, { type: "bar", data: dados, options: opcoesGrafico() });
    }
  }

  function atualizarResumo(linhas) {
    const total = linhas.reduce((s, l) => s + Number(l.total), 0);
    const preenchidos = linhas.reduce((s, l) => s + Number(l.preenchidos), 0);
    const pendente = total - preenchidos;
    const pct = total ? Math.round((preenchidos / total) * 100) : 0;
    elResumoTotal.textContent = total.toLocaleString("pt-BR");
    elResumoPreenchido.textContent = preenchidos.toLocaleString("pt-BR");
    elResumoPendente.textContent = pendente.toLocaleString("pt-BR");
    elResumoPct.textContent = `${pct}%`;
  }

  async function atualizar() {
    const linhas = await buscarProgresso(sb);
    ultimoDado = linhas;
    preencherSelectLojas(linhas);
    atualizarResumo(linhas);
    desenharGraficoLojas(linhas);
    desenharGraficoDetalhe(linhas, selectLojaDetalhe.value);
  }

  selectLojaDetalhe.addEventListener("change", () => {
    desenharGraficoDetalhe(ultimoDado, selectLojaDetalhe.value);
  });

  return { atualizar };
}
