-- Phase 5 — who went through when the score didn't say.
--
-- A knockout match can finish level and still have a winner: penalties, or a
-- tie awarded by the league. The score stays what was played on the pitch, and
-- this records the decision separately. Deriving it from a doctored scoreline
-- would corrupt goal difference for anyone who also plays a league phase.

alter table public.matches
  add column winner_team_id uuid references public.teams (id) on delete restrict;

-- The winner has to be one of the two teams that played.
alter table public.matches
  add constraint matches_winner_is_a_participant check (
    winner_team_id is null
    or winner_team_id = home_team_id
    or winner_team_id = away_team_id
  );

comment on column public.matches.winner_team_id is
  'Only for knockouts settled off the scoreboard (penalties, awarded ties). Null everywhere else — the score decides.';
