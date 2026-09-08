CREATE TABLE "event_result_source" (
	"event_id" integer PRIMARY KEY NOT NULL,
	"raw_fetch_id" bigint NOT NULL,
	"list_id" text NOT NULL,
	"hidden" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_result_source" ADD CONSTRAINT "event_result_source_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_result_source" ADD CONSTRAINT "event_result_source_raw_fetch_id_raw_fetch_id_fk" FOREIGN KEY ("raw_fetch_id") REFERENCES "public"."raw_fetch"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- The normalized spine records its selected list revision in
-- event_result_source. When alternatives exist normalize selects the one
-- visible list. Reporting reads that binding only: later raw archives cannot
-- reinterpret published results until normalize atomically updates both the
-- spine and the binding. Legacy rows without a binding fail closed.
create or replace view v_race_result as
with event_lap_provenance as (
  select
    v.event_id,
    coalesce(bool_or(
      ers.hidden = false
        and rf.payload ? 'DataFields'
        and rf.payload -> 'DataFields' ? 'RankOrStatusTT'
    ), false)
      and not bool_or(
        v.laps is not null or v.lap1 is not null or v.lap2 is not null
          or v.lap3 is not null or v.lap4 is not null
      ) as source_is_time_trial
  from v_individual_result v
  left join event_result_source ers on ers.event_id = v.event_id
  left join raw_fetch rf on rf.id = ers.raw_fetch_id
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
        and (p.source_is_time_trial or r.laps = r.category_laps)
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
    when not p.source_is_time_trial and (w.laps is null or w.category_laps is null) then null
    when not p.source_is_time_trial and w.laps < w.category_laps then null
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
