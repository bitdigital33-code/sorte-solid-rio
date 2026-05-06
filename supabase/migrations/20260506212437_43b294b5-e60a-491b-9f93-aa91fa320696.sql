
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Admins can view roles" ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Raffle config (single row)
CREATE TABLE public.raffle_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL DEFAULT 'Rifa Solidária',
  premio TEXT NOT NULL DEFAULT 'Prêmio surpresa',
  descricao TEXT,
  imagem_url TEXT,
  total_cotas INTEGER NOT NULL DEFAULT 1000,
  valor_cota_centavos INTEGER NOT NULL DEFAULT 1000,
  data_sorteio TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  pix_key TEXT,
  pix_nome TEXT,
  pix_cidade TEXT,
  status TEXT NOT NULL DEFAULT 'aberta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.raffle_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read raffle config" ON public.raffle_config FOR SELECT USING (true);
CREATE POLICY "Admin update raffle config" ON public.raffle_config FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert raffle config" ON public.raffle_config FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.raffle_config (nome, premio, descricao, total_cotas, data_sorteio, pix_key, pix_nome, pix_cidade)
VALUES ('Rifa Solidária', 'iPhone 15 Pro Max 256GB', 'Ajude nossa causa e concorra a um prêmio incrível!', 1000, now() + INTERVAL '30 days', 'rifa@exemplo.com', 'ORGANIZADOR DA RIFA', 'SAO PAULO');

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  comprador_nome TEXT NOT NULL,
  cpf_hash TEXT NOT NULL,
  cpf_mascarado TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT NOT NULL,
  qtd_cotas INTEGER NOT NULL CHECK (qtd_cotas > 0),
  valor_total_centavos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  pix_payload TEXT,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view all orders" ON public.orders FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update orders" ON public.orders FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_share_token ON public.orders(share_token);

-- Tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero INTEGER NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view tickets" ON public.tickets FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_tickets_order ON public.tickets(order_id);

-- Draw result
CREATE TABLE public.draw_result (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_sorteado INTEGER NOT NULL,
  seed TEXT NOT NULL,
  fonte_seed TEXT NOT NULL,
  order_id_vencedor UUID REFERENCES public.orders(id),
  vencedor_nome TEXT,
  video_url TEXT,
  publicado BOOLEAN NOT NULL DEFAULT false,
  executado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.draw_result ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published result" ON public.draw_result FOR SELECT
  USING (publicado = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manage result" ON public.draw_result FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Audit log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  acao TEXT NOT NULL,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin view audit" ON public.audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('raffle-videos', 'raffle-videos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('raffle-images', 'raffle-images', true);

CREATE POLICY "Public read raffle videos" ON storage.objects FOR SELECT
  USING (bucket_id = 'raffle-videos');
CREATE POLICY "Admin upload raffle videos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'raffle-videos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update raffle videos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'raffle-videos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete raffle videos" ON storage.objects FOR DELETE
  USING (bucket_id = 'raffle-videos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read raffle images" ON storage.objects FOR SELECT
  USING (bucket_id = 'raffle-images');
CREATE POLICY "Admin upload raffle images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'raffle-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update raffle images" ON storage.objects FOR UPDATE
  USING (bucket_id = 'raffle-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete raffle images" ON storage.objects FOR DELETE
  USING (bucket_id = 'raffle-images' AND public.has_role(auth.uid(), 'admin'));

-- Function to confirm order: assign ticket numbers
CREATE OR REPLACE FUNCTION public.confirm_order(_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order RECORD;
  _next_num INTEGER;
  _i INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO _order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _order IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF _order.status = 'confirmado' THEN RETURN; END IF;

  SELECT COALESCE(MAX(numero), 0) INTO _next_num FROM public.tickets;

  FOR _i IN 1.._order.qtd_cotas LOOP
    _next_num := _next_num + 1;
    INSERT INTO public.tickets (numero, order_id) VALUES (_next_num, _order_id);
  END LOOP;

  UPDATE public.orders
    SET status = 'confirmado', confirmed_at = now(), confirmed_by = auth.uid()
    WHERE id = _order_id;

  INSERT INTO public.audit_log (user_id, acao, detalhes)
    VALUES (auth.uid(), 'confirm_order', jsonb_build_object('order_id', _order_id, 'qtd_cotas', _order.qtd_cotas));
END;
$$;
