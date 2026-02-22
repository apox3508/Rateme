-- Ensure approved faces are readable both before and after login.

alter table if exists public.faces enable row level security;

-- Replace existing SELECT policies on faces to avoid role mismatch (anon only, etc).
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'faces'
      and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.faces', p.policyname);
  end loop;
end
$$;

create policy faces_select_approved_all
  on public.faces
  for select
  to anon, authenticated
  using (status = 'approved');
