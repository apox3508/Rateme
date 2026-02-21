-- Prevent duplicate ratings per authenticated user and face.
alter table if exists public.ratings
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table if exists public.ratings
  alter column user_id set default auth.uid();

create unique index if not exists ratings_user_face_unique_idx
  on public.ratings (user_id, face_id)
  where user_id is not null;

alter table if exists public.ratings enable row level security;

-- Remove any existing INSERT policies so anonymous inserts cannot bypass auth checks.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ratings'
      and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.ratings', p.policyname);
  end loop;
end
$$;

-- Keep ratings readable for scoreboard aggregation.
create policy ratings_select_all
  on public.ratings
  for select
  to anon, authenticated
  using (true);

-- Only authenticated users can insert ratings for themselves.
create policy ratings_insert_authenticated_own
  on public.ratings
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = coalesce(user_id, auth.uid()));
