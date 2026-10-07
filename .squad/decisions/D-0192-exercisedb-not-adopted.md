---
id: D-0192
title: "GitHub #32: don't scrape or call ExerciseDB at run time; no ExerciseDB data or GIFs without written licence terms that allow caching and redistribution (human call, H-26). Improve the library in place instead: original or verified-wger rows, starting with bodyweight breadth (T-0522)"
status: decided
date: 2026-10-06
by: product-owner (GitHub #32 intake)
area: content
builds-on: D-0005, D-0033, D-0089, D-0024, D-0063
---
## Context
GitHub #32 (the owner): "Improve workout items. https://github.com/ExerciseDB/exercisedb-api — Look
at this alternative. 2000 calls per month. Could save each workout on the fly. Try to scrape as much
as possible."

The library today is 78 rows in `data/exercises/library/`. Every row is original workoutLab text
(`source: "workoutlab"`, `LicenseRef-workoutLab`, D-0033 §8). wger (CC BY-SA 4.0) is the allowed
upstream for adapted text (D-0005, D-0089), and D-0005 rules out third-party images in v1. The
engine needs per row: weights 1.0 / 0.5 on our nine areas, equipment from our vocabulary, level,
compound or isolation, timed with a default duration, an increment and variants (D-0033). It reads
the library on the device so it stays offline and deterministic (principle 3, D-0063 §3).

**Terms check.** This intake could not open the ExerciseDB repo, its README or its terms: the
product-owner role has no web access in this run. Everything below about ExerciseDB is from general
knowledge and is **unverified**. The human must check it against the live terms.
- The GitHub repo publishes API *code*. A code licence (open-source or otherwise) grants nothing
  about the exercise *data* or the *media*, which are licensed separately, if at all.
- ExerciseDB is, as far as is known, a commercial dataset with free and paid tiers. Its animated
  GIFs and images are its own media. Quota-limited APIs commonly forbid bulk downloading,
  "scraping", caching beyond a short time, and redistribution.
- No CC- or ODbL-style open data licence for the dataset was found to rely on.

**Fit, even if the terms allowed it.**
- *2000 calls/month.* The quota is per API key, so the whole user base shares it, not each user.
  One user at about 12 workouts a month × 5 exercises is about 60 calls, so 2000 calls cover about
  30 active users. Calling it "on the fly" also breaks offline use (NFR offline, UF-09 works
  without a network). It puts a third party in the workout path, which is a processor/disclosure
  question under NFR-PRIV-2. And it makes `suggest` depend on a network response, which breaks
  principle 3.
- *Scraping as much as possible* is the part that most likely breaks the provider's terms. It's
  not planned.
- *Data model.* ExerciseDB-style rows carry body part, target and secondary muscle names,
  equipment names, instructions and a GIF URL. They carry no area weights in our sense, no level,
  no compound/isolation type, no timed default, no increment and no variants. Every imported row
  would still need hand curation to be usable by the engine. So the only thing an import would add
  is breadth of names and instructions, and wger plus original text already gives us that under a
  licence we've checked.

## Decision
1. **No scraping, no bulk caching and no run-time calls to ExerciseDB.** Nothing in the app or the
   pipeline calls its API.
2. **No ExerciseDB data or media in `data/exercises/`** unless the human first gets written terms
   (a licence page or a paid-plan agreement) that allow storing, modifying and redistributing the
   specific fields, inside an offline PWA. Even then, GIFs/images also need D-0005's
   "no third-party images" lifted by a separate decision. This is H-26.
3. **The compliant way to "improve workout items" is to improve our own library.** New rows are
   original workoutLab text, or wger-adapted text with a `source_url` someone has opened and
   checked (D-0033 §8). Each row is curated with the engine fields above. The first gap is breadth
   for the no-equipment profile: 3 bodyweight-only exercises with weight 1.0 for each of
   shoulders, arms, core, glutes, quads, hamstrings and calves, 4 for chest and back (main
   fa4171e). That's the pool Remove, Skip today (D-0191), Swap and Shuffle draw from, and with 3
   per area a bodyweight user sees repeats quickly. T-0522 adds one bodyweight row per area.
4. ExerciseDB may still be used by a human as **inspiration** for which exercises are missing
   (names of common movements aren't protected). Its text, structure, images and ids are never
   copied.

## Consequences
- T-0522 (content): nine new bodyweight rows, one per area, with original text.
- H-26 for the human (H-24/H-25 are taken by D-0190): confirm §1–§2, or bring ExerciseDB's written terms and a plan or tier
  choice if they want its data or media anyway. If so, the product-owner re-specs from those
  terms.

## Human confirmation (2026-10-06, H-26)
The human chose option 1: not adopted; grow our own library. Terms checked: the repo's AGPL-3.0
covers code only. ExerciseDB's Terms of Use make all data and media AscendAPI's property and
strictly prohibit storing any data, content or media ("real-time data fetching on each request"
only; no scraping or bulk collection; rights end with the subscription). Source:
https://exercisedb.notion.site/ExerciseDB-API-Terms-of-Use-226983b728ca8090bf7be79564e4b356.
§1–§4 stand. T-0522/T-0523 are unblocked.

## Revisit when
- The human produces ExerciseDB terms that clearly permit storage and redistribution of named fields
  (and, separately, media) in an offline app.
- Users ask for demonstration media. Then decide on media as a whole (own illustrations per D-0005
  versus a licensed source), not per provider.
