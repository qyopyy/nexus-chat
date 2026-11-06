-- Keep game_scores.game permissive (new arcade ids are added often). A temporary fixed-list check
-- from the Beat Battle rollout blocked the newer games; this removes it again.
alter table public.game_scores drop constraint if exists game_scores_game_check;
