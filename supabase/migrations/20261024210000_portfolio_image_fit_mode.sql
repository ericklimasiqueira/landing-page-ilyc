-- Let each portfolio photo choose between a cropped fill and the full image.
alter table public.portfolio_images
  add column if not exists fit_mode text not null default 'cover'
  check (fit_mode in ('cover', 'contain'));
