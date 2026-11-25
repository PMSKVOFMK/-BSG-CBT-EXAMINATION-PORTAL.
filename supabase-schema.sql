-- BSG CBT Portal database schema (Supabase / PostgreSQL)
-- Run this entire script in Supabase SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text unique not null,
 full_name text not null default '',
 role text not null check (role in ('admin','examiner','student')),
 created_at timestamptz not null default now()
);
create table if not exists public.exams (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 level text not null,
 total_marks integer not null check(total_marks>0),
 duration_minutes integer not null check(duration_minutes>0),
 starts_at timestamptz,
 ends_at timestamptz,
 instructions text default '',
 status text not null default 'draft' check(status in ('draft','published','closed')),
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create table if not exists public.questions (
 id uuid primary key default gen_random_uuid(),
 exam_id uuid not null references public.exams(id) on delete cascade,
 question_text text not null,
 question_type text not null check(question_type in ('mcq','short','long','drawing')),
 marks integer not null check(marks>0),
 options jsonb,
 correct_answer text,
 position integer not null default 1
);
create table if not exists public.exam_assignments (
 id uuid primary key default gen_random_uuid(),
 exam_id uuid not null references public.exams(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 assigned_at timestamptz not null default now(),
 unique(exam_id,student_id)
);
create table if not exists public.submissions (
 id uuid primary key default gen_random_uuid(),
 exam_id uuid not null references public.exams(id),
 student_id uuid not null references public.profiles(id),
 status text not null default 'submitted' check(status in ('submitted','published')),
 submitted_at timestamptz not null default now(),
 published_at timestamptz,
 marks_awarded numeric(7,2),
 unique(exam_id,student_id)
);
create table if not exists public.answers (
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null references public.submissions(id) on delete cascade,
 question_id uuid not null references public.questions(id),
 answer_text text default '',
 auto_marks numeric(7,2) not null default 0,
 marks_awarded numeric(7,2),
 unique(submission_id,question_id)
);
create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$
 select role from public.profiles where id=auth.uid()
$$;
alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.exam_assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.answers enable row level security;
create policy "profiles self or staff read" on public.profiles for select using(id=auth.uid() or public.current_role() in ('admin','examiner'));
create policy "admins manage profiles" on public.profiles for all using(public.current_role()='admin') with check(public.current_role()='admin');
create policy "exams staff manage" on public.exams for all using(public.current_role() in ('admin','examiner')) with check(public.current_role() in ('admin','examiner'));
create policy "students view assigned published exams" on public.exams for select using(status='published' and exists(select 1 from public.exam_assignments a where a.exam_id=id and a.student_id=auth.uid()));
create policy "questions staff manage" on public.questions for all using(public.current_role() in ('admin','examiner')) with check(public.current_role() in ('admin','examiner'));
create policy "students read assigned questions" on public.questions for select using(exists(select 1 from public.exam_assignments a join public.exams e on e.id=a.exam_id where a.exam_id=exam_id and a.student_id=auth.uid() and e.status='published'));
create policy "admins manage assignments" on public.exam_assignments for all using(public.current_role()='admin') with check(public.current_role()='admin');
create policy "students read own assignments" on public.exam_assignments for select using(student_id=auth.uid());
create policy "student or staff read submissions" on public.submissions for select using(student_id=auth.uid() or public.current_role() in ('admin','examiner'));
create policy "students create own submission" on public.submissions for insert with check(student_id=auth.uid() and exists(select 1 from public.exam_assignments a join public.exams e on e.id=a.exam_id where a.exam_id=exam_id and a.student_id=auth.uid() and e.status='published'));
create policy "staff update submissions" on public.submissions for update using(public.current_role() in ('admin','examiner')) with check(public.current_role() in ('admin','examiner'));
create policy "answers student or staff read" on public.answers for select using(exists(select 1 from public.submissions s where s.id=submission_id and (s.student_id=auth.uid() or public.current_role() in ('admin','examiner'))));
create policy "students insert own answers" on public.answers for insert with check(exists(select 1 from public.submissions s where s.id=submission_id and s.student_id=auth.uid()));
create policy "staff grade answers" on public.answers for update using(public.current_role() in ('admin','examiner')) with check(public.current_role() in ('admin','examiner'));
-- Create auth users in Supabase Authentication first, then add their profile row:
-- insert into public.profiles(id,email,full_name,role) values ('AUTH_USER_UUID','admin@example.com','Portal Administrator','admin');
