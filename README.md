# BSG Digital Examination Portal
Separate CBT project for PM SHRI Kendriya Vidyalaya, Ordnance Factory Medak.

## Hosting
The frontend is static and can be hosted on GitHub Pages. Supabase provides PostgreSQL, authentication and row-level access control.

## Connect the database
1. Create a Supabase project at https://supabase.com.
2. Open SQL Editor and run all of `supabase-schema.sql`.
3. In Project Settings → API, copy the Project URL and anon/public key.
4. Copy `config.example.js` to `config.js`, enter those two values, and commit `config.js` to this public repository. The anon/public key is intended for browser use; never expose a service_role key.
5. Create users in Supabase Authentication → Users. Add a matching row in public.profiles with that auth user's UUID, email, full name and role ('admin', 'examiner' or 'student').
6. Assign exams to student profiles from the Administrator dashboard.

## Important
- The portal code is a database-connected starter application, not yet approved for a live/high-stakes exam.
- Configure Supabase and test all roles before using real candidates.
- Drawing upload, reliable autosave/resume, robust exam locking, bulk student provisioning, email invitations and OYMS integration need additional implementation. The present drawing response accepts text only; file storage is not wired yet.
- Keep the Supabase service_role key private. Do not add it to this website.
