# Human gates

Only these actions wait for a human. Everything else the squad decides and logs.
When a gate is hit: write it in `needs-human.md`, skip that ticket, continue with other work.

1. **Accounts and credentials.** Creating accounts, generating or pasting tokens/keys. Agents only read tokens from the environment (`.env.local`, never committed).
2. **Money.** Anything that starts billing (paid plans, add-ons, domains).
3. **First production deploy** of each surface (landing, app, Supabase prod). Later prod deploys run on green CI.
4. **DNS changes outside `workout.vestgote.com` and `app.workout.vestgote.com`.** The apex and other records on vestgote.com are off-limits.
5. **Destructive data operations in production** (dropping tables, deleting users, resetting the database).
6. **Publishing** under a person's or Uptive's name beyond the landing page copy already approved in a decision.
7. **Creating or making public the GitHub repository.**
