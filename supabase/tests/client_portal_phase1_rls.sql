begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(76);

create function pg_temp.statement_sqlstate(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return '00000';
exception when others then
  return sqlstate;
end
$$;

-- Migration shape and helper hardening.
select has_table('public', 'client_organizations', 'client_organizations exists');
select has_table('public', 'client_users', 'client_users exists');
select has_table('public', 'client_projects', 'client_projects exists');
select has_table('public', 'candidate_shares', 'candidate_shares exists');
select has_table('public', 'report_shares', 'report_shares exists');
select has_table('public', 'client_feedback', 'client_feedback exists');
select has_schema('private', 'private helper schema exists');
select ok(to_regprocedure('private.current_client_user_id()') is not null, 'current_client_user_id exists');
select ok(to_regprocedure('private.current_client_organization_id()') is not null, 'current_client_organization_id exists');
select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.client_organizations'::regclass,
      'public.client_users'::regclass,
      'public.client_projects'::regclass,
      'public.candidate_shares'::regclass,
      'public.report_shares'::regclass,
      'public.client_feedback'::regclass
    )
      and relrowsecurity
  ),
  6,
  'all six Portal tables enable RLS'
);
select ok(
  (
    select procedure.prosecdef
      and exists (select 1 from unnest(procedure.proconfig) config where config like 'search_path=%')
    from pg_proc procedure
    where procedure.oid = 'private.current_client_user_id()'::regprocedure
  ),
  'current_client_user_id is a search-path-safe security definer'
);
select ok(
  (
    select procedure.prosecdef
      and exists (select 1 from unnest(procedure.proconfig) config where config like 'search_path=%')
    from pg_proc procedure
    where procedure.oid = 'private.current_client_organization_id()'::regprocedure
  ),
  'current_client_organization_id is a search-path-safe security definer'
);
select is(
  (select count(*)::integer from pg_proc where oid in ('private.current_client_user_id()'::regprocedure, 'private.current_client_organization_id()'::regprocedure) and pronargs <> 0),
  0,
  'private helpers accept no caller-controlled organization parameter'
);
select is(
  (
    select count(*)::integer
    from pg_namespace namespace
    cross join lateral aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) privilege
    where namespace.nspname = 'private'
      and privilege.grantee = 0
      and privilege.privilege_type = 'USAGE'
  ),
  0,
  'PUBLIC has no private schema usage'
);
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no private schema usage');
select ok(has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated has private schema usage');
select ok(not has_function_privilege('anon', 'private.current_client_user_id()', 'EXECUTE'), 'anon cannot execute current_client_user_id');
select ok(not has_function_privilege('anon', 'private.current_client_organization_id()', 'EXECUTE'), 'anon cannot execute current_client_organization_id');
select ok(has_function_privilege('authenticated', 'private.current_client_user_id()', 'EXECUTE'), 'authenticated can execute current_client_user_id');
select ok(has_function_privilege('authenticated', 'private.current_client_organization_id()', 'EXECUTE'), 'authenticated can execute current_client_organization_id');
select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('client_organizations', 'client_users', 'client_projects', 'candidate_shares', 'report_shares', 'client_feedback')
      and grantee = 'anon'
  ),
  0,
  'anon has no Portal table grants'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'client_org_select_self',
        'client_user_select_self',
        'client_project_select_active',
        'candidate_share_select_shared',
        'report_share_select_shared',
        'feedback_select_self',
        'feedback_insert_self'
      )
  ),
  7,
  'all required customer policies exist, including feedback_insert_self'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in ('client_organizations', 'client_users', 'client_projects', 'candidate_shares', 'report_shares', 'client_feedback')
      and cmd in ('UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'no customer UPDATE, DELETE, or ALL policy exists'
);

-- Synthetic local-only identities. No password, customer identifier, PORK33 ID, or customer address is used.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'portal-a@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b1', 'portal-b@example.invalid'),
  ('00000000-0000-4000-8000-0000000000c1', 'portal-disabled@example.invalid'),
  ('00000000-0000-4000-8000-0000000000d1', 'portal-inactive-org@example.invalid'),
  ('00000000-0000-4000-8000-0000000000e1', 'portal-constraint@example.invalid');

insert into public.client_organizations (id, name, status) values
  ('10000000-0000-4000-8000-0000000000a1', 'TEST_ORG_A', 'ACTIVE'),
  ('10000000-0000-4000-8000-0000000000b1', 'TEST_ORG_B', 'ACTIVE'),
  ('10000000-0000-4000-8000-0000000000c1', 'TEST_ORG_INACTIVE', 'INACTIVE');

insert into public.client_users (id, auth_user_id, organization_id, login_identifier, status) values
  ('20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 'test-user-a', 'ACTIVE'),
  ('20000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b1', 'test-user-b', 'ACTIVE'),
  ('20000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000a1', 'test-user-disabled', 'DISABLED'),
  ('20000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000c1', 'test-user-inactive-org', 'ACTIVE');

insert into public.client_projects (id, organization_id, case_id, name, status) values
  ('30000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 'TEST_CASE_A', 'TEST_PROJECT_A', 'ACTIVE'),
  ('30000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a1', 'TEST_CASE_A_ARCHIVED', 'TEST_PROJECT_A_ARCHIVED', 'ARCHIVED'),
  ('30000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b1', 'TEST_CASE_B', 'TEST_PROJECT_B', 'ACTIVE'),
  ('30000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000c1', 'TEST_CASE_INACTIVE_ORG', 'TEST_PROJECT_INACTIVE_ORG', 'ACTIVE');

insert into public.candidate_shares (id, project_id, candidate_store_id, status, shared_at, shared_by_actor) values
  ('40000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'TEST-CAND-A-SHARED', 'SHARED', now(), 'TEST_ACTOR'),
  ('40000000-0000-4000-8000-0000000000a2', '30000000-0000-4000-8000-0000000000a1', 'TEST-CAND-A-READY', 'READY_TO_SHARE', null, null),
  ('40000000-0000-4000-8000-0000000000a3', '30000000-0000-4000-8000-0000000000a1', 'TEST-CAND-A-ARCHIVED', 'ARCHIVED', now(), 'TEST_ACTOR'),
  ('40000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'TEST-CAND-B-SHARED', 'SHARED', now(), 'TEST_ACTOR'),
  ('40000000-0000-4000-8000-0000000000c1', '30000000-0000-4000-8000-0000000000c1', 'TEST-CAND-INACTIVE-ORG', 'SHARED', now(), 'TEST_ACTOR');

insert into public.report_shares (id, project_id, generation_id, report_type, file_name, status) values
  ('50000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a1', 'generation-test-a-shared', 'FIELD_BRIEFING', 'test-a.pdf', 'SHARED'),
  ('50000000-0000-4000-8000-0000000000a2', '30000000-0000-4000-8000-0000000000a1', 'generation-test-a-archived', 'DECISION_REPORT', 'test-a-archived.pdf', 'ARCHIVED'),
  ('50000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', 'generation-test-b-shared', 'CANDIDATE_SINGLE', 'test-b.pdf', 'SHARED'),
  ('50000000-0000-4000-8000-0000000000c1', '30000000-0000-4000-8000-0000000000c1', 'generation-test-inactive-org', 'REGION_REPORT', 'test-inactive.pdf', 'SHARED');

insert into public.client_feedback (id, candidate_share_id, client_user_id, type) values
  ('60000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'INTERESTED'),
  ('60000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', 'INTERESTED');

-- Real PostgreSQL constraint failures.
select is(pg_temp.statement_sqlstate($$insert into public.client_organizations (name, status) values ('INVALID', 'UNKNOWN')$$), '23514', 'invalid organization status is rejected');
select is(pg_temp.statement_sqlstate($$insert into public.client_users (auth_user_id, organization_id, login_identifier) values ('00000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000a1', 'test-user-a')$$), '23505', 'duplicate login identifier is rejected');
select is(pg_temp.statement_sqlstate($$insert into public.client_projects (organization_id, case_id, name) values ('10000000-0000-4000-8000-0000000000a1', 'TEST_CASE_A', 'DUPLICATE')$$), '23505', 'duplicate organization and case is rejected');
select is(pg_temp.statement_sqlstate($$insert into public.candidate_shares (project_id, candidate_store_id) values ('30000000-0000-4000-8000-0000000000a1', 'TEST-CAND-A-READY')$$), '23505', 'duplicate CandidateShare is rejected');
select is(pg_temp.statement_sqlstate($$insert into public.candidate_shares (project_id, candidate_store_id, status) values ('30000000-0000-4000-8000-0000000000a1', 'TEST-CAND-INVALID', 'UNKNOWN')$$), '23514', 'invalid CandidateShare status is rejected');
select is(pg_temp.statement_sqlstate($$insert into public.candidate_shares (project_id, candidate_store_id, status, shared_at, shared_by_actor) values ('30000000-0000-4000-8000-0000000000a1', 'TEST-CAND-READY-DATED', 'READY_TO_SHARE', now(), 'TEST_ACTOR')$$), '23514', 'READY_TO_SHARE with sharing metadata is rejected');
select is(pg_temp.statement_sqlstate($$insert into public.report_shares (project_id, generation_id, report_type, file_name) values ('30000000-0000-4000-8000-0000000000a1', 'generation-test-invalid-type', 'UNKNOWN', 'invalid.pdf')$$), '23514', 'invalid report type is rejected');
select is(pg_temp.statement_sqlstate($$insert into public.report_shares (project_id, generation_id, report_type, file_name) values ('30000000-0000-4000-8000-0000000000a1', 'generation-test-path', 'FIELD_BRIEFING', '../invalid.pdf')$$), '23514', 'path-shaped report file name is rejected');
select is(pg_temp.statement_sqlstate($$insert into public.client_feedback (candidate_share_id, client_user_id, type) values ('40000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'INTERESTED')$$), '23505', 'duplicate INTERESTED feedback is rejected');
select is(pg_temp.statement_sqlstate($$insert into public.client_feedback (candidate_share_id, client_user_id, type) values ('40000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'COMMENT')$$), '23514', 'COMMENT without a message is rejected');

-- User A authenticated context: own active and SHARED records only.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select results_eq($$select id from public.client_organizations order by id$$, array['10000000-0000-4000-8000-0000000000a1'::uuid], 'User A sees only Organization A');
select results_eq($$select id from public.client_projects order by id$$, array['30000000-0000-4000-8000-0000000000a1'::uuid], 'User A sees only active Project A');
select results_eq($$select id from public.candidate_shares order by id$$, array['40000000-0000-4000-8000-0000000000a1'::uuid], 'User A sees only SHARED Candidate A');
select results_eq($$select id from public.report_shares order by id$$, array['50000000-0000-4000-8000-0000000000a1'::uuid], 'User A sees only SHARED Report A');
select results_eq($$select id from public.client_feedback order by id$$, array['60000000-0000-4000-8000-0000000000a1'::uuid], 'User A sees only own feedback');
select is(private.current_client_user_id(), '20000000-0000-4000-8000-0000000000a1'::uuid, 'User A helper resolves only its client user');
select is(private.current_client_organization_id(), '10000000-0000-4000-8000-0000000000a1'::uuid, 'User A helper resolves only Organization A');
select results_eq(
  $$insert into public.client_feedback (candidate_share_id, client_user_id, type, message) values ('40000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'REQUEST_REVIEW', 'Synthetic local review') returning client_user_id$$,
  array['20000000-0000-4000-8000-0000000000a1'::uuid],
  'User A can insert own feedback for own SHARED Candidate'
);
select is(pg_temp.statement_sqlstate($$insert into public.client_feedback (candidate_share_id, client_user_id, type) values ('40000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', 'REQUEST_REVIEW')$$), '42501', 'User A cannot insert feedback as User B');
select is(pg_temp.statement_sqlstate($$insert into public.client_feedback (candidate_share_id, client_user_id, type) values ('40000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000a1', 'REQUEST_REVIEW')$$), '42501', 'User A cannot insert feedback for Organization B Candidate');
select is(pg_temp.statement_sqlstate($$update public.client_feedback set message = 'denied' where id = '60000000-0000-4000-8000-0000000000a1'$$), '42501', 'User A cannot update feedback');
select is(pg_temp.statement_sqlstate($$delete from public.client_feedback where id = '60000000-0000-4000-8000-0000000000a1'$$), '42501', 'User A cannot delete feedback');
reset role;

-- User B proves the inverse tenant boundary.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
select results_eq($$select id from public.client_organizations order by id$$, array['10000000-0000-4000-8000-0000000000b1'::uuid], 'User B sees only Organization B');
select results_eq($$select id from public.client_projects order by id$$, array['30000000-0000-4000-8000-0000000000b1'::uuid], 'User B sees only active Project B');
select results_eq($$select id from public.candidate_shares order by id$$, array['40000000-0000-4000-8000-0000000000b1'::uuid], 'User B sees only SHARED Candidate B');
select results_eq($$select id from public.report_shares order by id$$, array['50000000-0000-4000-8000-0000000000b1'::uuid], 'User B sees only SHARED Report B');
select results_eq($$select id from public.client_feedback order by id$$, array['60000000-0000-4000-8000-0000000000b1'::uuid], 'User B sees only own feedback');
reset role;

-- Disabled users and users belonging to an inactive Organization receive no Portal rows.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
select results_eq(
  $$select count(*) from public.client_organizations union all select count(*) from public.client_users union all select count(*) from public.client_projects union all select count(*) from public.candidate_shares union all select count(*) from public.report_shares union all select count(*) from public.client_feedback$$,
  array[0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint],
  'DISABLED client user sees no Portal rows'
);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';
select results_eq(
  $$select count(*) from public.client_organizations union all select count(*) from public.client_users union all select count(*) from public.client_projects union all select count(*) from public.candidate_shares union all select count(*) from public.report_shares union all select count(*) from public.client_feedback$$,
  array[0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint],
  'user in INACTIVE Organization sees no Portal rows'
);
reset role;

-- anon has no SELECT, INSERT, UPDATE, or DELETE access to any Portal table.
set local role anon;
select is(pg_temp.statement_sqlstate('select * from public.client_organizations'), '42501', 'anon cannot SELECT client_organizations');
select is(pg_temp.statement_sqlstate('insert into public.client_organizations default values'), '42501', 'anon cannot INSERT client_organizations');
select is(pg_temp.statement_sqlstate('update public.client_organizations set id = id'), '42501', 'anon cannot UPDATE client_organizations');
select is(pg_temp.statement_sqlstate('delete from public.client_organizations'), '42501', 'anon cannot DELETE client_organizations');
select is(pg_temp.statement_sqlstate('select * from public.client_users'), '42501', 'anon cannot SELECT client_users');
select is(pg_temp.statement_sqlstate('insert into public.client_users default values'), '42501', 'anon cannot INSERT client_users');
select is(pg_temp.statement_sqlstate('update public.client_users set id = id'), '42501', 'anon cannot UPDATE client_users');
select is(pg_temp.statement_sqlstate('delete from public.client_users'), '42501', 'anon cannot DELETE client_users');
select is(pg_temp.statement_sqlstate('select * from public.client_projects'), '42501', 'anon cannot SELECT client_projects');
select is(pg_temp.statement_sqlstate('insert into public.client_projects default values'), '42501', 'anon cannot INSERT client_projects');
select is(pg_temp.statement_sqlstate('update public.client_projects set id = id'), '42501', 'anon cannot UPDATE client_projects');
select is(pg_temp.statement_sqlstate('delete from public.client_projects'), '42501', 'anon cannot DELETE client_projects');
select is(pg_temp.statement_sqlstate('select * from public.candidate_shares'), '42501', 'anon cannot SELECT candidate_shares');
select is(pg_temp.statement_sqlstate('insert into public.candidate_shares default values'), '42501', 'anon cannot INSERT candidate_shares');
select is(pg_temp.statement_sqlstate('update public.candidate_shares set id = id'), '42501', 'anon cannot UPDATE candidate_shares');
select is(pg_temp.statement_sqlstate('delete from public.candidate_shares'), '42501', 'anon cannot DELETE candidate_shares');
select is(pg_temp.statement_sqlstate('select * from public.report_shares'), '42501', 'anon cannot SELECT report_shares');
select is(pg_temp.statement_sqlstate('insert into public.report_shares default values'), '42501', 'anon cannot INSERT report_shares');
select is(pg_temp.statement_sqlstate('update public.report_shares set id = id'), '42501', 'anon cannot UPDATE report_shares');
select is(pg_temp.statement_sqlstate('delete from public.report_shares'), '42501', 'anon cannot DELETE report_shares');
select is(pg_temp.statement_sqlstate('select * from public.client_feedback'), '42501', 'anon cannot SELECT client_feedback');
select is(pg_temp.statement_sqlstate('insert into public.client_feedback default values'), '42501', 'anon cannot INSERT client_feedback');
select is(pg_temp.statement_sqlstate('update public.client_feedback set id = id'), '42501', 'anon cannot UPDATE client_feedback');
select is(pg_temp.statement_sqlstate('delete from public.client_feedback'), '42501', 'anon cannot DELETE client_feedback');
reset role;

select * from finish();
rollback;
