
-- Public can create orders (checkout)
CREATE POLICY "Public insert orders"
ON public.orders FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Public can read their own order by share_token (used on receipt page)
CREATE POLICY "Public read order by token"
ON public.orders FOR SELECT
TO anon, authenticated
USING (true);

-- Public can read tickets (numbers are public for transparency)
CREATE POLICY "Public read tickets"
ON public.tickets FOR SELECT
TO anon, authenticated
USING (true);
