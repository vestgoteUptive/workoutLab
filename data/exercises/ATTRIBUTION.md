# Attribution

wger.de is an open-source workout manager whose exercise database is licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). D-0005 asks this library to
base its text on wger and rewrite it in plain, short English, recording source and licence per
file.

Text has been modified from the original. When a row does carry `source: "wger"`, every
instruction and cue on it is rewritten in plain, short English (one action per step) and
shortened to fit workoutLab's one-task screens. The share-alike terms of CC BY-SA 4.0 apply to
any such row: reuse of that row's text must also be shared under CC BY-SA 4.0, with attribution
to wger.de.

For T-0103a (the bodyweight profile) and T-0103b (the dumbbell and full-gym rows), the
content-curator drafted every row's text from general exercise-form knowledge rather than
transcribing a specific, verified wger page, so no row shipped by either ticket can honestly
claim `source: "wger"` (see D-0033 §8): a `source: "wger"` row must carry a real `source_url` of
the form `https://wger.de/en/exercise/<numeric-id>/view/<slug>` that someone actually opened and
checked against the file's text. Every row instead carries `source: "workoutlab"` and
`license: "LicenseRef-workoutLab"`, with no `source_url` and no `attribution` field (per AC7).
This text is original workoutLab content and is not covered by CC BY-SA 4.0.

## wger-sourced exercise ids

None yet. When a future ticket adapts text from a specific, verified wger exercise page, add its
id here, set `source: "wger"`, `license: "CC-BY-SA-4.0"`, a real `source_url`, and an
`attribution` string, and note the share-alike terms then apply to that row: any reuse of that
row's text must also be shared under CC BY-SA 4.0, with attribution to wger.de.
