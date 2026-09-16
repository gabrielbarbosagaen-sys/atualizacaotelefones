-- ============================================================================
-- Atualização de Telefones - Colaboradores | Supermercados Rondon
-- Execute este script inteiro no SQL Editor do Supabase (Project > SQL Editor)
-- ANTES de importar o CSV e publicar o site.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) Tabela principal (dados sensíveis: telefone). NUNCA fica acessível
--    diretamente pelo cliente (anon) — só via view segura e funções abaixo.
-- ----------------------------------------------------------------------------
create table if not exists public.colaboradores (
  cadastro        bigint primary key,
  nome            text not null,
  filial          text not null,
  departamento    text not null,
  telefone        text,              -- DDD + número, somente dígitos (10 ou 11 dígitos)
  preenchido_por  text,
  atualizado_em   timestamptz
);

create index if not exists idx_colaboradores_filial on public.colaboradores (filial);
create index if not exists idx_colaboradores_departamento on public.colaboradores (departamento);
create index if not exists idx_colaboradores_nome on public.colaboradores (nome);

alter table public.colaboradores enable row level security;
-- Nenhuma policy criada para "anon" de propósito: acesso direto à tabela fica
-- bloqueado. Todo acesso do site acontece pela view e pelas funções (RPC)
-- definidas abaixo, que controlam exatamente o que cada visitante pode ver/fazer.

-- ----------------------------------------------------------------------------
-- 2) View pública de busca — usada pela tela do gestor.
--    Expõe só o necessário para localizar o colaborador e saber se já foi
--    preenchido; NUNCA expõe o número de telefone.
-- ----------------------------------------------------------------------------
create or replace view public.colaboradores_busca as
select
  cadastro,
  nome,
  filial,
  departamento,
  (telefone is not null and telefone <> '') as preenchido
from public.colaboradores;

grant select on public.colaboradores_busca to anon;

-- Listas de lojas/departamentos distintos, para os filtros da tela do gestor.
-- Sempre retorna 1 linha (com arrays dentro) -- imune ao limite padrao de
-- 1000 linhas por requisicao do PostgREST, diferente de um SELECT direto
-- na tabela/view quando ha milhares de colaboradores.
create or replace function public.filtros_disponiveis()
returns table (lojas text[], departamentos text[])
language sql
security definer
set search_path = public
as $$
  select
    array(select distinct filial from public.colaboradores order by 1),
    array(select distinct departamento from public.colaboradores order by 1);
$$;

grant execute on function public.filtros_disponiveis() to anon;

-- ----------------------------------------------------------------------------
-- 3) RPC: progresso agregado por loja/departamento (sem dados pessoais)
--    Usada pelo gráfico em tempo real.
-- ----------------------------------------------------------------------------
create or replace function public.progresso()
returns table (
  filial text,
  departamento text,
  total bigint,
  preenchidos bigint
)
language sql
security definer
set search_path = public
as $$
  select
    filial,
    departamento,
    count(*) as total,
    count(*) filter (where telefone is not null and telefone <> '') as preenchidos
  from public.colaboradores
  group by filial, departamento
  order by filial, departamento;
$$;

grant execute on function public.progresso() to anon;

-- ----------------------------------------------------------------------------
-- 4) RPC: salvar telefone de um colaborador.
--    Validação do formato acontece aqui no servidor (10 ou 11 dígitos),
--    então mesmo que alguém tente burlar o site, o banco recusa dado inválido.
-- ----------------------------------------------------------------------------
create or replace function public.salvar_telefone(
  p_cadastro bigint,
  p_telefone text,
  p_preenchido_por text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');

  if length(v_digits) not in (10, 11) then
    raise exception 'Telefone inválido: informe DDD + número (10 ou 11 dígitos).';
  end if;

  update public.colaboradores
     set telefone       = v_digits,
         preenchido_por = nullif(trim(coalesce(p_preenchido_por, '')), ''),
         atualizado_em  = now()
   where cadastro = p_cadastro;

  if not found then
    raise exception 'Colaborador com cadastro % não encontrado.', p_cadastro;
  end if;

  return true;
end;
$$;

grant execute on function public.salvar_telefone(bigint, text, text) to anon;

-- ----------------------------------------------------------------------------
-- 5) Página do admin: senha + exportação completa.
--    A senha fica guardada como hash (nunca em texto puro) e a checagem
--    acontece dentro do banco — não só no navegador.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_config (
  chave text primary key,
  valor text not null
);
alter table public.admin_config enable row level security;
-- Sem policy para anon: só acessível via função security definer abaixo.

insert into public.admin_config (chave, valor)
values ('senha_hash', crypt('14993', gen_salt('bf')))
on conflict (chave) do update set valor = excluded.valor;

-- Para trocar a senha depois, rode:
--   update public.admin_config set valor = crypt('NOVA_SENHA', gen_salt('bf')) where chave = 'senha_hash';

-- Controle simples de tentativas para dificultar tentativa de adivinhação da senha.
create table if not exists public.admin_login_tentativas (
  id          bigint generated always as identity primary key,
  criado_em   timestamptz not null default now(),
  sucesso     boolean not null
);

create or replace function public.exportar_dados(p_senha text)
returns table (
  cadastro        bigint,
  nome            text,
  filial          text,
  departamento    text,
  telefone        text,
  preenchido_por  text,
  atualizado_em   timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_falhas int;
begin
  select count(*) into v_falhas
  from public.admin_login_tentativas
  where sucesso = false
    and criado_em > now() - interval '10 minutes';

  if v_falhas >= 5 then
    raise exception 'Muitas tentativas incorretas. Aguarde 10 minutos e tente novamente.';
  end if;

  select valor into v_hash from public.admin_config where chave = 'senha_hash';

  if v_hash is null or crypt(p_senha, v_hash) <> v_hash then
    insert into public.admin_login_tentativas (sucesso) values (false);
    raise exception 'Senha incorreta.';
  end if;

  insert into public.admin_login_tentativas (sucesso) values (true);

  return query
    select c.cadastro, c.nome, c.filial, c.departamento, c.telefone, c.preenchido_por, c.atualizado_em
    from public.colaboradores c
    order by c.filial, c.departamento, c.nome;
end;
$$;

grant execute on function public.exportar_dados(text) to anon;

-- ----------------------------------------------------------------------------
-- 6) Tempo real: permite que o gráfico atualize sozinho em todos os
--    navegadores abertos quando qualquer gestor salvar um telefone.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'colaboradores'
  ) then
    alter publication supabase_realtime add table public.colaboradores;
  end if;
end $$;

-- ============================================================================
-- Depois de rodar este script:
--   1. Vá em Table Editor > colaboradores > Insert > Import data from CSV
--      e importe o arquivo supabase/colaboradores_import.csv
--      (colunas: cadastro, nome, filial, departamento)
--   2. Confirme em Database > Replication que a tabela "colaboradores" está
--      marcada para Realtime (o comando acima já faz isso, mas vale conferir).
-- ============================================================================
