CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT,
  role public.app_role NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role),
  UNIQUE (email, role)
);

CREATE TABLE IF NOT EXISTS public.raffle_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL DEFAULT 'Ação entre Amigos',
  premio TEXT NOT NULL DEFAULT 'Premio surpresa',
  descricao TEXT,
  imagem_url TEXT,
  total_cotas INTEGER NOT NULL DEFAULT 1000 CHECK (total_cotas > 0),
  valor_cota_centavos INTEGER NOT NULL DEFAULT 1000 CHECK (valor_cota_centavos > 0),
  data_sorteio TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  pix_key TEXT,
  pix_nome TEXT,
  pix_cidade TEXT,
  status TEXT NOT NULL DEFAULT 'aberta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  comprador_nome TEXT NOT NULL,
  cpf_hash TEXT NOT NULL,
  cpf_mascarado TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT NOT NULL,
  qtd_cotas INTEGER NOT NULL CHECK (qtd_cotas > 0),
  valor_total_centavos INTEGER NOT NULL CHECK (valor_total_centavos > 0),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aguardando', 'confirmado', 'cancelado')),
  pix_payload TEXT,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT
);

CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero INTEGER NOT NULL UNIQUE CHECK (numero > 0),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.draw_result (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_sorteado INTEGER NOT NULL CHECK (numero_sorteado > 0),
  seed TEXT NOT NULL,
  fonte_seed TEXT NOT NULL,
  order_id_vencedor UUID REFERENCES public.orders(id),
  vencedor_nome TEXT,
  video_url TEXT,
  publicado BOOLEAN NOT NULL DEFAULT false,
  executado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT,
  acao TEXT NOT NULL,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_share_token ON public.orders(share_token);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON public.tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_draw_result_publicado ON public.draw_result(publicado);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_raffle_config_updated_at ON public.raffle_config;
CREATE TRIGGER set_raffle_config_updated_at
BEFORE UPDATE ON public.raffle_config
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.raffle_config (
  nome,
  premio,
  descricao,
  total_cotas,
  valor_cota_centavos,
  data_sorteio,
  pix_key,
  pix_nome,
  pix_cidade
)
SELECT
  'Ação entre Amigos',
  'iPhone 15 Pro Max 256GB',
  'Ajude nossa causa e concorra a um premio incrivel!',
  1000,
  1000,
  now() + interval '30 days',
  'rifa@exemplo.com',
  'ORGANIZADOR DA RIFA',
  'SAO PAULO'
WHERE NOT EXISTS (SELECT 1 FROM public.raffle_config);

INSERT INTO public.user_roles (email, role)
VALUES ('admin@bitdigital.com.br', 'admin')
ON CONFLICT DO NOTHING;
