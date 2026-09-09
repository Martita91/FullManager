-- Yellow-card accumulation, which every league sets differently: five over a
-- long season, three over a short one. Zero turns it off and leaves red cards
-- as the only automatic ban.

alter table public.competitions
  add column suspension_yellow_cards smallint not null default 5
    check (suspension_yellow_cards between 0 and 20);

comment on column public.competitions.suspension_yellow_cards is
  'Yellow cards that cost a player their next match. 0 disables accumulation; red cards still ban.';
