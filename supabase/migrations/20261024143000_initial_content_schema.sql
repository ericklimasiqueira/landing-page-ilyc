-- Ilyc landing page content schema.
-- Roles are assigned by a trusted server-side process and stored in app_metadata.role.
-- Never derive privileges from user_metadata or a client-controlled form.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.site_settings (
  id boolean primary key default true check (id),
  brand_name text not null default 'Ilyc',
  city text not null default '',
  hero_tagline text not null default '',
  hero_cover_path text,
  portfolio_heading text not null default 'Ensaios selecionados',
  about_heading text not null default 'Por trás da lente',
  biography text not null default '',
  portrait_path text,
  start_year integer check (start_year is null or start_year between 1900 and 2200),
  service_region text not null default '',
  contact_heading text not null default 'Vamos marcar o seu ensaio?',
  contact_email text not null default '',
  whatsapp_url text not null default '',
  instagram_url text not null default '',
  starting_price_label text not null default '',
  is_published boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  year integer check (year is null or year between 1900 and 2200),
  location text not null default '',
  description text not null default '',
  cover_path text,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.portfolio_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portfolio_projects(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, sort_order)
);

create table public.process_steps (
  id uuid primary key default gen_random_uuid(),
  step_number integer not null unique check (step_number > 0),
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

create index portfolio_projects_public_order_idx
  on public.portfolio_projects (is_published, sort_order, created_at);
create index portfolio_images_project_order_idx
  on public.portfolio_images (project_id, sort_order);
create index process_steps_public_order_idx
  on public.process_steps (is_published, sort_order);
create index faq_items_public_order_idx
  on public.faq_items (is_published, sort_order);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();
create trigger portfolio_projects_set_updated_at
  before update on public.portfolio_projects
  for each row execute function public.set_updated_at();
create trigger process_steps_set_updated_at
  before update on public.process_steps
  for each row execute function public.set_updated_at();
create trigger faq_items_set_updated_at
  before update on public.faq_items
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;
alter table public.portfolio_projects enable row level security;
alter table public.portfolio_images enable row level security;
alter table public.process_steps enable row level security;
alter table public.faq_items enable row level security;

revoke all on public.site_settings, public.portfolio_projects, public.portfolio_images,
  public.process_steps, public.faq_items from anon, authenticated;
grant select on public.site_settings, public.portfolio_projects, public.portfolio_images,
  public.process_steps, public.faq_items to anon, authenticated;
grant insert, update, delete on public.site_settings, public.portfolio_projects,
  public.portfolio_images, public.process_steps, public.faq_items to authenticated;

create policy "published site settings are readable"
  on public.site_settings for select to anon, authenticated
  using (
    is_published
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );
create policy "admins and editors manage site settings"
  on public.site_settings for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'));

create policy "published projects are readable"
  on public.portfolio_projects for select to anon, authenticated
  using (
    is_published
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );
create policy "admins and editors manage projects"
  on public.portfolio_projects for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'));

create policy "images of published projects are readable"
  on public.portfolio_images for select to anon, authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
    or exists (
      select 1
      from public.portfolio_projects as project
      where project.id = portfolio_images.project_id
        and project.is_published
    )
  );
create policy "admins and editors manage portfolio images"
  on public.portfolio_images for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'));

create policy "published process steps are readable"
  on public.process_steps for select to anon, authenticated
  using (
    is_published
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );
create policy "admins and editors manage process steps"
  on public.process_steps for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'));

create policy "published faq items are readable"
  on public.faq_items for select to anon, authenticated
  using (
    is_published
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );
create policy "admins and editors manage faq items"
  on public.faq_items for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'));

insert into public.site_settings (id)
values (true)
on conflict (id) do nothing;

insert into public.process_steps (step_number, title, description, sort_order, is_published)
values
  (1, 'Conversa', 'Alinhamos a ideia do ensaio, o local e a data.', 1, false),
  (2, 'Ensaio', 'A sessão acontece com calma, no seu ritmo.', 2, false),
  (3, 'Entrega', 'Você recebe as fotos tratadas.', 3, false)
on conflict (step_number) do nothing;

-- Private bucket: public image delivery will use signed URLs only for published projects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ilyc-portfolio',
  'ilyc-portfolio',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

revoke all on storage.objects from anon, authenticated;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

create policy "published portfolio images can be signed and read"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'ilyc-portfolio'
    and storage.allow_any_operation(array['object.sign', 'object.get_signed'])
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
      or exists (
        select 1
        from public.portfolio_images as image
        join public.portfolio_projects as project on project.id = image.project_id
        where image.storage_path = storage.objects.name
          and project.is_published
      )
    )
  );
create policy "admins and editors upload portfolio images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ilyc-portfolio'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );
create policy "admins and editors update portfolio images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'ilyc-portfolio'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  )
  with check (
    bucket_id = 'ilyc-portfolio'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );
create policy "admins and editors delete portfolio images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ilyc-portfolio'
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor')
  );
