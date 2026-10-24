-- Keep crop coordinates precise enough to reproduce the framing selected in the editor.
alter table public.site_settings
  alter column hero_cover_crop_x type double precision using hero_cover_crop_x::double precision,
  alter column hero_cover_crop_y type double precision using hero_cover_crop_y::double precision,
  alter column portrait_crop_x type double precision using portrait_crop_x::double precision,
  alter column portrait_crop_y type double precision using portrait_crop_y::double precision;

alter table public.portfolio_images
  alter column crop_x type double precision using crop_x::double precision,
  alter column crop_y type double precision using crop_y::double precision;
