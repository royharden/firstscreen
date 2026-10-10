/*
# Storage policy: anon SELECT-only on firstscreen-screenshots bucket

1. Security changes
- Add a SELECT-only policy on storage.objects for the firstscreen-screenshots
  bucket so anon/authenticated can read screenshots publicly.
- No INSERT/UPDATE/DELETE policy is created — uploads are done only from the
  fetch-page edge function using the service-role client, which bypasses RLS.
- This ensures anon users can view screenshots but cannot create, modify, or
  delete any storage objects.
*/

DROP POLICY IF EXISTS "anon_read_screenshots" ON storage.objects;
CREATE POLICY "anon_read_screenshots" ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'firstscreen-screenshots');
