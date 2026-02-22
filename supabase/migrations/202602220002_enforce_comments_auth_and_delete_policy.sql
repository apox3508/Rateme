-- Require authentication for comment creation and allow users to delete their own comments.

drop policy if exists comments_insert_anon on public.comments;
drop policy if exists comments_insert_authenticated_own on public.comments;
drop policy if exists comments_delete_authenticated_own on public.comments;

create policy comments_insert_authenticated_own
  on public.comments
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = coalesce(user_id, auth.uid()));

create policy comments_delete_authenticated_own
  on public.comments
  for delete
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);
