-- Allow anonymous ratings while keeping authenticated per-user duplicate protection.

drop policy if exists ratings_insert_authenticated_own on public.ratings;
drop policy if exists ratings_insert_anon on public.ratings;

create policy ratings_insert_authenticated_own
  on public.ratings
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = coalesce(user_id, auth.uid()));

create policy ratings_insert_anon
  on public.ratings
  for insert
  to anon
  with check (auth.uid() is null and user_id is null);
