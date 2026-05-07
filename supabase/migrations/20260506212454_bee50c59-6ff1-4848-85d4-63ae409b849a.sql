
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order(UUID) TO authenticated;

-- Restrict bucket listing: replace broad public SELECT with object-name targeted policies (still public read but blocks listing via prefix)
DROP POLICY IF EXISTS "Public read raffle videos" ON storage.objects;
DROP POLICY IF EXISTS "Public read raffle images" ON storage.objects;

CREATE POLICY "Public read specific raffle videos" ON storage.objects FOR SELECT
  USING (bucket_id = 'raffle-videos' AND name IS NOT NULL AND position('/' in name) = 0);
CREATE POLICY "Public read specific raffle images" ON storage.objects FOR SELECT
  USING (bucket_id = 'raffle-images' AND name IS NOT NULL AND position('/' in name) = 0);
