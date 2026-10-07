# Prod backup recipient (T-0543, D-0201 §4)

`age-recipient.txt` holds the **public** age key that encrypts the pre-release `pg_dump`.
It ships as a placeholder; `infra/scripts/prod-backup.sh` fails (and so the release job and the
deploy) until the owner replaces it (gate H-28):

1. `age-keygen -o workoutlab-backup.key` on your own machine. Keep the key file offline, in your
   password manager. Never commit it.
2. Put the printed `age1...` public key as the only non-comment line of `age-recipient.txt`.

Restore: see "Restore from a backup" in `infra/README.md`.
