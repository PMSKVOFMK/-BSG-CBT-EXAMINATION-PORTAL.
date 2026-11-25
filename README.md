# BSG Digital Examination Portal
Independent CBT application for PM SHRI Kendriya Vidyalaya, Ordnance Factory Medak.

## Live website
https://pmskvofmk.github.io/-BSG-CBT-EXAMINATION-PORTAL./

## Supabase backend
Project: BSG-CBT-EXAMINATION-PORTAL (Mumbai, ap-south-1).
The frontend uses the public publishable key in `config.js`. Never add a Supabase secret or service-role key to GitHub/browser code.

## First Super Admin setup (one-time)
1. In Supabase Dashboard open Authentication → Users → Add user.
2. Create your own administrator email and a strong password; confirm the user.
3. Copy the new user's UUID.
4. In SQL Editor run this, replacing the three values:
```sql
insert into public.profiles(id,email,full_name,role)
values ('AUTH_USER_UUID','your-email@example.com','Portal Administrator','admin');
```
5. Sign in to the website using Administrator Login. This is the only manual profile bootstrap. After this, create student and examiner accounts from the Admin dashboard.

## Admin account creation
The `admin-create-users` Edge Function checks the caller's Supabase Auth session and verifies the caller has `admin` role in `public.profiles`. It creates student/examiner users using the server-only secret key. The secret is never included in this repository or browser.

Bulk account entry format (one per line): `Full Name,email,password,student` or `Full Name,email,password,examiner`. Use temporary passwords and distribute them securely.

## Exam workflow
1. Admin creates a draft exam, adds questions and answer keys, assigns students, then opens the exam.
2. Students start the exam. Start time is recorded by the database; submission is rejected after the configured exam window or duration and duplicate submissions are blocked.
3. MCQ answers are marked automatically on the server. Written responses receive no automatic marks and must be reviewed by an examiner.
4. Examiner saves question-wise marks and publishes the result.
5. Admin can export results as CSV, Excel, or print/save as PDF.

## Important limits before a live examination
- Semantic AI scoring for written responses is not enabled. Examiners manually award written marks; do not treat an AI similarity guess as official marks.
- Drawing/image upload, answer autosave/resume, retest scheduling, email delivery of credentials, detailed audit logs, pass/fail rules, and direct OYMS import remain future enhancements.
- Current exam time limits and duplicate-submission protection are enforced by database RPCs. Test with separate student, examiner, and admin accounts before real exams.
- Ensure each question's marks add up to the exam total and set the correct answer key for every MCQ.
