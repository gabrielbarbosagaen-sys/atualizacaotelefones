# Atualização de Telefones — Colaboradores (Supermercados Rondon)

Site estático (HTML/CSS/JS puro, sem build) para os gestores de loja preencherem o
telefone dos colaboradores, com gráfico de progresso em tempo real e uma área
administrativa protegida por senha para baixar a planilha final.

- **Frontend:** GitHub Pages (arquivos estáticos)
- **Backend/banco:** Supabase (Postgres + funções RPC)

> ⚠️ Este repositório é **público**. Por isso, `Base_colaboradores_.xlsx` e
> `supabase/colaboradores_import.csv` (que contêm nomes reais dos colaboradores)
> estão no `.gitignore` e **não são enviados ao GitHub** — eles continuam só na
> sua máquina. Para reimportar/gerar o CSV, use
> `python scripts/generate_import_csv.py` localmente (veja passo 3 abaixo).

## Estrutura

```
index.html          Formulário do gestor (busca/filtro + progresso + preenchimento)
admin.html           Área do administrador (senha + exportação em .xlsx)
assets/config.js     URL e chave pública do Supabase (preencher após criar o projeto)
assets/app.js        Lógica da página do gestor
assets/admin.js       Lógica da página do administrador
assets/progresso.js  Gráfico de progresso (compartilhado pelas duas páginas)
assets/style.css     Estilos
supabase/schema.sql              Script único para criar tabela, views, funções e regras de segurança
supabase/colaboradores_import.csv Lista dos 2246 colaboradores (gerada da planilha original) para importar
scripts/generate_import_csv.py   Regenera o CSV acima a partir de Base_colaboradores_.xlsx
```

## Como os dados ficam protegidos

- Os gestores **nunca** têm acesso direto de leitura/escrita à tabela `colaboradores`.
  Eles usam:
  - a **view** `colaboradores_busca`, que mostra nome/loja/departamento/crachá e um
    booleano "já preenchido" — **nunca** o telefone de ninguém;
  - a **função** `salvar_telefone(...)`, que só grava o telefone do próprio
    colaborador que o gestor está editando, validando o formato no banco.
- A área admin não faz a checagem de senha só no navegador: a senha é validada
  **dentro do Postgres** (função `exportar_dados`, com hash bcrypt e bloqueio
  temporário após 5 tentativas erradas). Só depois disso os telefones reais
  trafegam para o navegador.
- A "anon key" do Supabase que fica em `assets/config.js` é pública por
  design — a proteção real está nas regras acima (RLS + funções), não em
  esconder essa chave.

⚠️ Aviso honesto: a senha "14993" é curta e o app é 100% estático (sem login
individual). O bloqueio após 5 tentativas erradas dificulta tentativas
automatizadas, mas não é segurança de nível bancário. Para um controle mais
forte no futuro, o ideal seria trocar por Supabase Auth (login individual dos
administradores) — posso implementar isso se quiser.

## Passo a passo do deploy

### 1. Criar o projeto no Supabase

1. Acesse https://supabase.com, crie uma conta/projeto novo (região São Paulo,
   se disponível).
2. Anote a **Project URL** e a **anon public key**, em
   *Project Settings > API*.

### 2. Rodar o script do banco

1. Abra *SQL Editor* no painel do Supabase.
2. Cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e execute.
   Isso cria a tabela, a view de busca, as funções `progresso`,
   `salvar_telefone`, `exportar_dados` e já grava a senha `14993` (em hash).

### 3. Importar os colaboradores

1. No painel, vá em *Table Editor > colaboradores > Insert > Import data from CSV*.
2. Envie o arquivo [`supabase/colaboradores_import.csv`](supabase/colaboradores_import.csv)
   (colunas `cadastro, nome, filial, departamento` — o telefone começa vazio).
3. Confirme o mapeamento de colunas e importe (2246 linhas).

Se a planilha original mudar depois, rode de novo:
```bash
python scripts/generate_import_csv.py
```
e reimporte o CSV gerado (ou atualize manualmente as linhas alteradas).

### 4. Conferir o Realtime (gráfico em tempo real)

O script já executa `alter publication supabase_realtime add table
public.colaboradores;`. Confirme em *Database > Replication* que a tabela
`colaboradores` aparece marcada — assim o gráfico atualiza sozinho em todos
os navegadores abertos quando qualquer gestor salva um telefone.

### 5. Preencher `assets/config.js`

Edite `assets/config.js` com os valores do passo 1:

```js
window.SUPABASE_CONFIG = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_ANON_KEY_AQUI",
};
```

### 6. Publicar no GitHub Pages

```bash
git add -A
git commit -m "Formulário de atualização de telefones dos colaboradores"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

Depois, no GitHub: *Settings > Pages > Source: Deploy from a branch*, branch
`main`, pasta `/ (root)`. O site fica em
`https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

### 7. Testar

- Abra a URL publicada, busque um colaborador, preencha DDD + telefone e
  salve. O gráfico de progresso deve atualizar.
- Abra `.../admin.html`, entre com a senha `14993` e baixe a planilha.

## Trocar a senha do admin

No SQL Editor do Supabase:

```sql
update public.admin_config
set valor = crypt('NOVA_SENHA', gen_salt('bf'))
where chave = 'senha_hash';
```
