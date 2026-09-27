# Data model (draft)

- **users**: id, email, created_at
- **profiles**: user_id, goal, level, rhythm_min, rhythm_max (sessions/week), equipment[], priority_areas[]
- **areas**: id (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves)
- **area_targets**: user_id, area_id, sets_per_14d, updated_at, source (default | adapted | manual)
- **exercises**: id, name, instructions[], mistakes[], image_url, equipment[], level, type (compound | isolation), source, license
- **exercise_areas**: exercise_id, area_id, weight (1.0 | 0.5)
- **sessions**: id, user_id, started_at, ended_at, time_budget_min, energy, location, effort_rating
- **session_sets**: id, session_id, exercise_id, set_index, reps, weight_kg, duration_s, is_warmup, completed_at

Rules: row-level security, so users only see their own rows. The 14-day load is computed from `session_sets` and can be cached in a view.
