## Sistema de Rifa Solidária

Plataforma web para venda de cotas de rifa a R$ 10,00 com pagamento via PIX (QR Code), painel admin, sorteio em data marcada e divulgação do vencedor com vídeo.

### Páginas

**Home (/)** — Landing da rifa
- Hero com nome da rifa, prêmio, foto, data do sorteio e contador regressivo
- Barra de progresso "X de Y cotas vendidas"
- Seletor de quantidade de cotas (-/+ e botões rápidos: 1, 5, 10, 25, 50)
- Total calculado em tempo real (qtd × R$ 10,00)
- Botão "Comprar cotas"
- **Após sorteio realizado:** seção de destaque com vídeo do sorteio + nome do vencedor + número sorteado

**Checkout (/checkout)** — Formulário do comprador
- Nome completo, CPF (máscara + validação dígito verificador), telefone, e-mail
- Validação client+server com Zod
- Resumo do pedido (qtd cotas, total)
- Aceite LGPD
- Botão "Gerar PIX"

**Pagamento (/pagamento/:pedidoId)** — Tela do QR Code
- QR Code PIX gerado (BR Code estático com a chave PIX configurada)
- Identificador único (RIFA-XXXXX) usado como TXID
- Botão "Copiar código PIX" e "Já paguei"
- Status muda para "aguardando confirmação"

**Comprovante (/comprovante/:pedidoId)** — Acesso por link único
- Mostra: nome, qtd de cotas compradas, números das cotas atribuídas (após confirmação), status do pagamento, data do sorteio
- Após sorteio: indica se foi vencedor

**Resultado do sorteio (/resultado)** — Página pública
- Vídeo do sorteio incorporado (player grande, responsivo)
- Número sorteado em destaque
- Nome do vencedor
- Data do sorteio e fonte da seed (ex: Loteria Federal nº XXXX)
- Botão para compartilhar

**Admin Login (/admin/login)** — Login único pré-definido

**Admin Dashboard (/admin)** — Painel em tempo real
- Cards: total arrecadado, cotas vendidas / disponíveis, pedidos pendentes/confirmados
- Gráfico de vendas por dia
- Tabela de pedidos com filtros e ações (confirmar pagamento → atribui números, cancelar)
- Configuração da rifa: nome, prêmio, imagem, data do sorteio, total de cotas, chave PIX, nome/cidade PIX
- **Seção Sorteio:**
  - Botão "Realizar sorteio" (habilitado na data): usa seed auditável (Loteria Federal) → sorteia número entre cotas vendidas
  - Mostra vencedor identificado
  - **Upload do vídeo do sorteio** (campo de arquivo + storage) para divulgação pública
  - Edição: pode trocar o vídeo depois
  - Toggle "Publicar resultado" — quando ativado, vídeo + vencedor aparecem na home e em /resultado

### Modelo de dados

- `raffle_config` — configuração única (nome, prêmio, imagem, total_cotas, valor_cota, data_sorteio, pix_key, pix_nome, pix_cidade, status)
- `orders` — pedidos (id, comprador_nome, cpf_hash, cpf_mascarado, telefone_cifrado, email, qtd_cotas, valor_total, status, share_token, created_at, confirmed_at)
- `tickets` — números de cota (numero, order_id) — gerados na confirmação
- `audit_log` — registro de ações admin
- `draw_result` — resultado do sorteio (numero_sorteado, seed, fonte_seed, order_id_vencedor, video_url, video_publicado, executado_em)

Storage bucket público `raffle-videos` para o vídeo do sorteio (upload via admin).

RLS: pedidos só visíveis ao admin; comprovante público via `share_token`; admin restrito por tabela `user_roles`.

### Segurança

- CPF: hash + versão mascarada (***.***.**1-23)
- Telefone criptografado
- Validação Zod em todos inputs
- Validação de dígito verificador de CPF
- Server functions para operações sensíveis
- Audit log de ações admin
- LGPD: aceite explícito, política de privacidade

### Pagamento PIX (sem gateway)

Geração de payload PIX estático (BR Code/EMV) com a chave PIX configurada e identificador do pedido no TXID. QR Code renderizado client-side. Confirmação manual pelo admin no painel após verificar o extrato.

### Design

Visual moderno e festivo: tipografia forte, cor primária vibrante (verde esmeralda + dourado para acentos de prêmio), cards com sombras suaves, animações sutis no contador e barra de progresso, totalmente responsivo mobile-first. Página de resultado com player de vídeo em destaque e tratamento celebratório do vencedor.

### Detalhes técnicos

- TanStack Start + React + Tailwind + shadcn/ui
- Lovable Cloud (Postgres + Auth + RLS + Storage)
- Server Functions para criar pedido, confirmar pagamento, sortear, publicar resultado
- Bibliotecas: `qrcode` (gerar QR), Zod, date-fns
- Sorteio auditável: seed da Loteria Federal da data → `numero_vencedor = seed % total_cotas_vendidas`

### Fora do escopo

- Webhook automático de PIX (requer gateway)
- Envio de e-mail/WhatsApp (apenas tela)
- Múltiplos admins (login único pré-definido)
