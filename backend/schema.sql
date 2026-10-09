create table if not exists public.study_classes (
    id uuid primary key,
    name text not null check (char_length(name) between 1 and 100),
    code text not null unique check (code ~ '^[A-Z0-9-]{3,20}$'),
    owner_token uuid not null,
    student_tokens uuid[] not null default '{}',
    created_at timestamptz not null default now()
);

create index if not exists study_classes_student_tokens_idx
    on public.study_classes using gin (student_tokens);

alter table public.study_classes enable row level security;

revoke all on public.study_classes from anon, authenticated;
grant all on public.study_classes to service_role;
