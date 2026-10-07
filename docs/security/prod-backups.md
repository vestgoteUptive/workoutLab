# Encrypted prod backups held by GitHub (T-0543, D-0201 §4)

Before each automatic prod release, CI dumps the `public` schema (and `auth` when the role may) and
encrypts it with `age` to a public key committed at `infra/backup/age-recipient.txt`. The
ciphertext is stored as a GitHub Actions artifact for **7 days**, then deleted by GitHub.

- Processor note: GitHub holds only age-encrypted dumps. It never sees plaintext, and it holds no
  decryption key. The owner holds the private key offline (H-28). This is not a new processor of
  plaintext personal data; the privacy notice's retention line should mention backups of up to 7 days.
- Plaintext exists only in a pipe on the runner and is never printed or written to disk.
- Losing the private key makes the backups unreadable. Rotating the key means replacing the recipient file.
- Revisit when the project leaves the Free plan (use Supabase PITR and drop the dump).
