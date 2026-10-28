# Clinician templates

Open the app through a web server. Without cloud configuration, existing browser saving continues to work.

The current schedule, template name, and selected day are automatically saved in this browser and restored on return. Named saved templates remain separate. Use the same website address and browser profile; clearing website data or closing a private browsing session removes browser storage. Automatic browser drafts are disabled while signed into a cloud account.

## Enable account storage

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Enable Email authentication. Keep email confirmation enabled and configure production SMTP for confirmation and password reset emails.
3. Set the Auth Site URL and allowed redirect URLs to this app's HTTPS address (and your localhost address for development).
4. In `cloud-config.js`, enter the project URL and **publishable** key (or legacy anon key). These are public client settings. Never use a secret/service-role key.
5. Deploy the updated files to the existing host. The application remains static; Supabase provides authentication and durable database storage.

Users create an account, confirm their email, and sign in. Save template writes to that account. Sign in with the same account on another computer to load templates. Saving is explicit; Refresh templates fetches changes from other computers. Concurrent saves of the same name use the last successful save.

Existing browser templates stay on their original computer. After signing in there, choose Import browser templates to copy them into the account without replacing matching cloud names. Signing out clears the account's schedule from the editor and restores the browser library.

## Verification

Run `node tests/schedule.cjs` for schedule and local template regression tests. Run `node --check app.js` and `node --check account.js` for syntax checks.

Before production, verify with two test accounts and two browsers: create/save in one browser, load under the same account in the other, confirm the second account cannot read or modify the first account's rows, import local templates, reset a password, and sign out. These integration checks require a configured Supabase project; local tests do not establish live authentication or database-policy correctness.

Supabase references: https://supabase.com/docs/reference/javascript/auth-signinwithpassword and https://supabase.com/docs/guides/database/postgres/row-level-security
