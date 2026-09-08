-- A combined Event can still carry two separate Category contests. (#106)
--
-- The canonical category deliberately strips ` - North` / ` - South`, so it
-- is useful for navigation but cannot be a complete contest key. At the
-- Prologue the old `(event_id, category)` windows crossed the two contests:
-- South's winner could become North's denominator, a two-lap leader could
-- short-lap North riders, and both fields read as one. The source publishes
-- conference on each row precisely for that combined-event shape.
--
-- State Champs has no category suffix, hence `conference is null` for every
-- row in its Category. PostgreSQL places null partition keys together, so the
-- same key intentionally leaves that league-wide contest combined.

--------------------------------------------------------------------------------
-- v_individual_result — distinguish a blank row from an absent lap layout
--
-- This view preserves lap evidence at both the Event and row level. It does
-- not turn an all-null Event into a time trial: only v_race_result can pair
-- that absence with the archived source-layout signature. Within an Event that
-- does publish lap evidence, a row with no split value or `-` sentinel has no
-- honest lap count. It must stay null rather than being called a zero-lap row.
--------------------------------------------------------------------------------
create or replace view v_individual_result as
with spine as (
  select
    ir.*,
    bool_or(
      ir.laps is not null or ir.lap1 is not null or ir.lap2 is not null
        or ir.lap3 is not null or ir.lap4 is not null
    ) over (partition by ir.event_id) as event_publishes_laps,
    (ir.lap1 is not null or ir.lap2 is not null
      or ir.lap3 is not null or ir.lap4 is not null) as row_publishes_laps
  from individual_result ir
)
select
  ir.event_id,
  e.source_event_id,
  e.name as event_name,
  rd.season_id,
  rd.ordinal as round_ordinal,
  s.year as season_year,
  ir.plate,
  ir.display_name,
  ir.scoring_team,
  ir.category_raw,
  coalesce(
    ir.category_level,
    regexp_replace(
      regexp_replace(btrim(ir.category_raw), '\s*-\s*(North|South)\s*$', ''),
      'Girl$', 'Girls'
    )
  ) as category,
  coalesce(
    ir.conference,
    (regexp_match(ir.category_raw, '-\s*(North|South)\s*$'))[1],
    e.conference
  ) as conference,
  ir.place,
  ir.status,
  ir.time_raw,
  ir.time_seconds,
  ir.points,
  coalesce(
    ir.laps,
    case when ir.event_publishes_laps and ir.row_publishes_laps then
      (case when nullif(ir.lap1, '-') is not null then 1 else 0 end)
        + (case when nullif(ir.lap2, '-') is not null then 1 else 0 end)
        + (case when nullif(ir.lap3, '-') is not null then 1 else 0 end)
        + (case when nullif(ir.lap4, '-') is not null then 1 else 0 end)
    end
  ) as laps,
  ir.lap1, ir.lap2, ir.lap3, ir.lap4,
  ir.penalty,
  ir.pts_leader,
  bt.gender,
  bt.grade,
  bt.team_place,
  coalesce(bt.scored, false) as scored,
  (bt.plate is null) as by_team_missing
from spine ir
  join event e on e.id = ir.event_id
  join round rd on rd.id = e.round_id
  join season s on s.id = rd.season_id
  left join individual_result_by_team bt
    on bt.event_id = ir.event_id and bt.plate = ir.plate;

--> statement-breakpoint

create or replace view v_race_result as
with event_lap_provenance as (
  select
    v.event_id,
    bool_or(
      v.laps is not null or v.lap1 is not null or v.lap2 is not null
        or v.lap3 is not null or v.lap4 is not null
    ) as event_publishes_laps
  from v_individual_result v
  group by v.event_id
),
ranked as (
  select
    v.*,
    max(case when v.status <> 'dnf' then v.laps end)
      over (partition by v.event_id, v.category, v.conference) as category_laps,
    count(*)
      over (partition by v.event_id, v.category, v.conference) as field_size
  from v_individual_result v
),
winner as (
  select
    r.*,
    min(case
      when r.status <> 'dnf'
        and (not p.event_publishes_laps or r.laps = r.category_laps)
      then r.time_seconds
    end)
      over (partition by r.event_id, r.category, r.conference) as winner_seconds
  from ranked r
  join event_lap_provenance p on p.event_id = r.event_id
)
select
  w.*,
  coalesce(w.status <> 'dnf' and w.laps < w.category_laps, false) as is_lapped,
  case
    when w.laps is null or w.category_laps is null then null
    else greatest(w.category_laps - w.laps, 0)
  end as laps_down,
  case
    when w.status = 'dnf' then null
    when p.event_publishes_laps and (w.laps is null or w.category_laps is null) then null
    when p.event_publishes_laps and w.laps < w.category_laps then null
    when w.winner_seconds is null or w.winner_seconds = 0 then null
    else round(((w.time_seconds / w.winner_seconds) - 1) * 100, 1)
  end as pct_back,
  case
    when w.field_size >= 10 and w.place ~ '^\d+$'
      then round((w.place::numeric / w.field_size) * 100)
    else null
  end as field_top_pct
from winner w
join event_lap_provenance p on p.event_id = w.event_id;
