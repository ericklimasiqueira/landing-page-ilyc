-- Persist the focal point chosen in the admin crop dialog.
alter table public.site_settings
  add column if not exists hero_cover_crop_x integer not null default 50 check (hero_cover_crop_x between 0 and 100),
  add column if not exists hero_cover_crop_y integer not null default 50 check (hero_cover_crop_y between 0 and 100),
  add column if not exists hero_cover_crop_zoom numeric(3,2) not null default 1 check (hero_cover_crop_zoom between 1 and 2),
  add column if not exists portrait_crop_x integer not null default 50 check (portrait_crop_x between 0 and 100),
  add column if not exists portrait_crop_y integer not null default 50 check (portrait_crop_y between 0 and 100),
  add column if not exists portrait_crop_zoom numeric(3,2) not null default 1 check (portrait_crop_zoom between 1 and 2);

alter table public.portfolio_images
  add column if not exists crop_x integer not null default 50 check (crop_x between 0 and 100),
  add column if not exists crop_y integer not null default 50 check (crop_y between 0 and 100),
  add column if not exists crop_zoom numeric(3,2) not null default 1 check (crop_zoom between 1 and 2);
