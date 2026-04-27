-- Store verification badge for public store pages.

alter table public.stores
add column is_verified boolean not null default false;

create index stores_is_verified_idx on public.stores (is_verified);
