# BSG Digital Examination Portal
Independent CBT application for PM SHRI Kendriya Vidyalaya, Ordnance Factory Medak.

## Live website
https://pmskvofmk.github.io/-BSG-CBT-EXAMINATION-PORTAL./

## Supabase backend
Project: BSG-CBT-EXAMINATION-PORTAL (Mumbai, ap-south-1).
The frontend uses only the public publishable key in `config.js`. Never add a Supabase secret or service-role key to GitHub/browser code.

## First Super Admin setup (one-time)
1. In Supabase Dashboard open Authentication → Users → Add user.
2. Create the administrator email and a strong password; confirm the user.
3. Copy the new user's UUID.
4. Insert the matching profile in `public.profiles` with role `admin`.
5. Sign in using Administrator Login. The current Super Admin profile has already been configured.

## Staff portal entry\n- Examiner sign-in: `https://pmskvofmk.github.io/-BSG-CBT-EXAMINATION-PORTAL./#/staff/examiner`\n- Super Admin sign-in: `https://pmskvofmk.github.io/-BSG-CBT-EXAMINATION-PORTAL./#/staff/super-admin`\n- The Super Admin creates examiner accounts. Each new examiner receives a unique `BSG-EXM-XXXXXXXX` ID and signs in with that ID plus the issued password. The registered email is retained for account administration.\n\n## Role responsibilities
- **Super Admin:** creates examiner accounts only; monitors all examinations and submitted/published marks; exports results as CSV, Excel, or print/save as PDF. The Super Admin does not create question papers, answer keys, or student accounts and does not mark scripts.
- **Examiner:** creates student accounts; creates and manages their own examinations, question papers and private answer keys; assigns students; schedules, opens and closes examinations; reviews written answers; finalises marks and publishes results.
- **Student:** writes assigned examinations and views published results.

The server-side `admin-create-users` Edge Function verifies the caller's authenticated Supabase session and role. Admin callers may create examiners only; examiner callers may create students only. Account creation uses a server-only secret key. The secret is never included in this repository or browser.

Bulk account entry format (one per line): `Full Name,email,password,examiner` for Super Admin, or `Full Name,email,password,student` for examiner. Use temporary passwords and distribute them securely.

## Exam workflow
1. Examiner creates an examination draft and question paper, sets the answer key, and assigns students.
2. The database checks that question marks add up to the exam total and every MCQ has an answer key before the examination can be opened.
3. Students start the exam. Start time is recorded by the database; submission is rejected after the configured exam window or duration and duplicate submissions are blocked.
4. MCQ answers are marked automatically on the server. Written responses must be reviewed and marked by the examiner.
5. Examiner finalises and publishes the result.
6. Super Admin monitors marks and exports the results. The exported marks can be entered into the separate BSG OYMS 2.0 main website manually.

## Main website separation
This CBT portal is a standalone application and database. It does not modify, connect to, or deploy changes to the BSG OYMS 2.0 main website or its database. Result transfer is by exported file only unless a separately approved integration is requested in the future.

## Important limits before a live examination
- Semantic AI scoring for written responses is not enabled. Examiners manually award written marks.
- Drawing/image upload, answer autosave/resume, retest scheduling, email delivery of credentials, detailed audit logs, pass/fail rules, and automatic OYMS import remain future enhancements.
- Current exam time limits and duplicate-submission protection are enforced by database RPCs. Test with separate student, examiner, and admin accounts before real exams.
