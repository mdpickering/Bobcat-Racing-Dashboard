# Dashboard steps — run AFTER `08b_cleanup_EXECUTE.sql` (nothing here has been done)

These two removals cannot be done with SQL: Supabase blocks direct `DELETE` on `storage.objects`, and test **auth users** are removed through the Auth admin path. Do them in this order.

## Step A — delete the 2 test files (Dashboard → Storage → `task-attachments`)
Delete exactly these 2 objects (they are the only files in the bucket):
- `task-attachments/27a6b5b8-83c8-4a3e-9040-2ef00e0d2871/1789680148035-retest-0019.txt`  (21 bytes, text/plain)
- `task-attachments/fcebf0c0-d403-4baa-a36e-5814b6303ea8/1789703376408-secret-suspension-file.txt`  (25 bytes, text/plain)

**Do NOT delete the bucket `task-attachments` and do not touch its policies.** After deleting, the bucket must show 0 objects.

## Step B — delete the 3 test auth users (Dashboard → Authentication → Users)
Only after 08b has committed (before that, the accounts are still referenced by foreign keys). Delete exactly:
- `member1@bobcat-test.dev`
- `lead1@bobcat-test.dev`
- `cto1@bobcat-test.dev`

**KEEP the owner's account (the only `@quinnipiac.edu` user, id `f15d8647-6a00-493a-8c07-1070f9a66b9b`).** If the dialog offers "soft delete", choose the **permanent** delete. Deleting an auth user cascades to its `public.profiles` row (the profile foreign key is `ON DELETE CASCADE`), so 3 profiles disappear with them and 1 remains.

## Step C — verify (`10_post_dashboard_verify_readonly.sql`)
It must return `"all_ok": true` with 1 auth user, 1 profile, 0 storage objects, the bucket + its 2 policies present, 27 tables, 88 policies.

## Not part of this cleanup
The old legacy Supabase project, `workspace_state`, the schema, policies, functions, triggers, Auth settings and the production data import are not touched. The import has not started.
