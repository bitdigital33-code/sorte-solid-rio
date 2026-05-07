<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

final class HttpError extends RuntimeException
{
    public function __construct(string $message, public int $status = 400)
    {
        parent::__construct($message);
    }
}

function config_file_path(): string
{
    return __DIR__ . '/config.php';
}

function load_app_config(bool $fresh = false): array
{
    static $config = null;
    if ($fresh || $config === null) {
        $file = config_file_path();
        $config = is_file($file) ? require $file : [];
        if (!is_array($config)) {
            $config = [];
        }
    }
    return $config;
}

function config_value(string $key, mixed $default = null): mixed
{
    $config = load_app_config();
    $env = getenv(strtoupper($key));
    return $config[$key] ?? ($env !== false ? $env : $default);
}

function write_app_config(array $updates): array
{
    $file = config_file_path();
    if (!is_file($file) || !is_writable($file)) {
        fail('Arquivo de configuracao nao permite alteracao.', 500);
    }

    $config = load_app_config(true);
    foreach ($updates as $key => $value) {
        $config[$key] = $value;
    }

    $content = "<?php\nreturn " . var_export($config, true) . ";\n";
    $tmp = $file . '.tmp';
    if (file_put_contents($tmp, $content, LOCK_EX) === false) {
        fail('Nao foi possivel salvar a configuracao.', 500);
    }
    @chmod($tmp, fileperms($file) & 0777);
    if (!rename($tmp, $file)) {
        @unlink($tmp);
        fail('Nao foi possivel aplicar a configuracao.', 500);
    }
    return load_app_config(true);
}

function respond(mixed $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode(['data' => $data], JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 400): never
{
    throw new HttpError($message, $status);
}

function read_json(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail('JSON invalido.', 400);
    }
    return $data;
}

function require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        fail('Metodo nao permitido.', 405);
    }
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $url = (string) config_value('database_url', '');
    if ($url === '') {
        fail('Banco de dados nao configurado.', 500);
    }

    $parts = parse_url($url);
    if (!is_array($parts) || empty($parts['host']) || empty($parts['path'])) {
        fail('DATABASE_URL invalida.', 500);
    }

    $host = $parts['host'];
    $port = (int) ($parts['port'] ?? 5432);
    $dbname = ltrim((string) $parts['path'], '/');
    $user = rawurldecode((string) ($parts['user'] ?? ''));
    $pass = rawurldecode((string) ($parts['pass'] ?? ''));
    $dsn = "pgsql:host={$host};port={$port};dbname={$dbname};sslmode=require";
    $firstHostPart = explode('.', $host)[0] ?? '';
    if (str_ends_with($host, '.neon.tech') && str_starts_with($firstHostPart, 'ep-')) {
        $endpoint = preg_replace('/-pooler$/', '', $firstHostPart) ?: $firstHostPart;
        $dsn .= ";options=endpoint={$endpoint}";
    }

    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_STRINGIFY_FETCHES => false,
    ]);
    $pdo->exec("SET TIME ZONE 'America/Cuiaba'");

    return $pdo;
}

function one(string $sql, array $params = []): ?array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

function many(string $sql, array $params = []): array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function cast_row(?array $row): ?array
{
    if ($row === null) {
        return null;
    }
    foreach (['total_cotas', 'valor_cota_centavos', 'qtd_cotas', 'valor_total_centavos', 'numero', 'numero_sorteado'] as $field) {
        if (array_key_exists($field, $row) && $row[$field] !== null) {
            $row[$field] = (int) $row[$field];
        }
    }
    if (array_key_exists('publicado', $row) && $row['publicado'] !== null) {
        $row['publicado'] = (bool) $row['publicado'];
    }
    return $row;
}

function get_config_row(): array
{
    $row = one('SELECT * FROM public.raffle_config ORDER BY created_at ASC LIMIT 1');
    if ($row === null) {
        $row = one(
            "INSERT INTO public.raffle_config (nome, premio, descricao, total_cotas, valor_cota_centavos, data_sorteio, pix_key, pix_nome, pix_cidade)
             VALUES ('Ação entre Amigos', 'Premio surpresa', 'Ajude nossa causa e concorra!', 1000, 1000, now() + interval '30 days', 'rifa@exemplo.com', 'ORGANIZADOR DA RIFA', 'SAO PAULO')
             RETURNING *"
        );
    }
    return cast_row($row) ?? [];
}

function ticket_code_expr(): string
{
    return "o.codigo || '-' || LPAD(t.numero::text, 4, '0')";
}

function draw_select_sql(string $where, bool $includeContact = false): string
{
    $contact = $includeContact ? ', o.telefone AS vencedor_telefone, o.email AS vencedor_email' : '';
    return "SELECT d.*,
                   o.codigo AS vencedor_pedido,
                   CASE
                       WHEN o.codigo IS NULL THEN LPAD(d.numero_sorteado::text, 4, '0')
                       ELSE o.codigo || '-' || LPAD(d.numero_sorteado::text, 4, '0')
                   END AS vencedor_codigo
                   {$contact}
            FROM public.draw_result d
            LEFT JOIN public.orders o ON o.id = d.order_id_vencedor
            {$where}";
}

function get_draw_row(string $where, array $params = [], bool $includeContact = false): ?array
{
    return cast_row(one(draw_select_sql($where, $includeContact), $params));
}

function ticket_by_number(int $numero): ?array
{
    $expr = ticket_code_expr();
    return cast_row(one(
        "SELECT t.numero,
                {$expr} AS codigo_cota,
                t.order_id,
                o.codigo AS order_codigo,
                o.comprador_nome,
                o.telefone,
                o.email,
                o.qtd_cotas
         FROM public.tickets t
         JOIN public.orders o ON o.id = t.order_id
         WHERE t.numero = :numero AND o.status = 'confirmado'
         LIMIT 1",
        [':numero' => $numero]
    ));
}

function ticket_by_offset(int $offset): ?array
{
    $expr = ticket_code_expr();
    return cast_row(one(
        "SELECT t.numero,
                {$expr} AS codigo_cota,
                t.order_id,
                o.codigo AS order_codigo,
                o.comprador_nome,
                o.telefone,
                o.email,
                o.qtd_cotas
         FROM public.tickets t
         JOIN public.orders o ON o.id = t.order_id
         WHERE o.status = 'confirmado'
         ORDER BY t.numero ASC
         LIMIT 1 OFFSET {$offset}"
    ));
}

function save_draw_result(array $ticket, string $seed, string $fonte): array
{
    $row = one(
        'INSERT INTO public.draw_result (numero_sorteado, seed, fonte_seed, order_id_vencedor, vencedor_nome)
         VALUES (:numero, :seed, :fonte, :order_id, :vencedor)
         RETURNING id',
        [
            ':numero' => (int) $ticket['numero'],
            ':seed' => $seed,
            ':fonte' => $fonte,
            ':order_id' => $ticket['order_id'] ?? null,
            ':vencedor' => $ticket['comprador_nome'] ?? null,
        ]
    );
    if ($row === null) {
        fail('Nao foi possivel registrar o sorteio.', 500);
    }
    return get_draw_row('WHERE d.id = :id LIMIT 1', [':id' => $row['id']], true) ?? [];
}

function base64url_encode_data(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64url_decode_data(string $value): string|false
{
    $padded = str_pad(strtr($value, '-_', '+/'), strlen($value) % 4 ? strlen($value) + 4 - strlen($value) % 4 : strlen($value), '=', STR_PAD_RIGHT);
    return base64_decode($padded, true);
}

function make_token(string $email): string
{
    $secret = (string) config_value('app_secret', '');
    if ($secret === '') {
        fail('APP_SECRET nao configurado.', 500);
    }
    $payload = base64url_encode_data(json_encode([
        'sub' => 'admin',
        'email' => $email,
        'exp' => time() + 8 * 60 * 60,
    ], JSON_UNESCAPED_SLASHES));
    $sig = base64url_encode_data(hash_hmac('sha256', $payload, $secret, true));
    return $payload . '.' . $sig;
}

function verify_token(?string $token): array
{
    $secret = (string) config_value('app_secret', '');
    if ($secret === '' || $token === null || !str_contains($token, '.')) {
        fail('Nao autorizado.', 401);
    }

    [$payload, $sig] = explode('.', $token, 2);
    $expected = base64url_encode_data(hash_hmac('sha256', $payload, $secret, true));
    if (!hash_equals($expected, $sig)) {
        fail('Nao autorizado.', 401);
    }

    $json = base64url_decode_data($payload);
    $data = $json === false ? null : json_decode($json, true);
    if (!is_array($data) || (int) ($data['exp'] ?? 0) < time()) {
        fail('Sessao expirada.', 401);
    }
    return $data;
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/i', $header, $m)) {
        return trim($m[1]);
    }
    return null;
}

function require_admin(): array
{
    $session = verify_token(bearer_token());
    $adminEmail = strtolower((string) config_value('admin_email', ''));
    $sessionEmail = strtolower((string) ($session['email'] ?? ''));
    if ($adminEmail !== '' && !hash_equals($adminEmail, $sessionEmail)) {
        fail('Nao autorizado.', 401);
    }
    return $session;
}

function sanitize_pix_text(string $value, int $max): string
{
    $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    if ($ascii === false) {
        $ascii = $value;
    }
    $ascii = preg_replace('/[^A-Za-z0-9 ]/', '', $ascii) ?? '';
    return substr(strtoupper($ascii), 0, $max);
}

function tlv(string $id, string $value): string
{
    return $id . str_pad((string) strlen($value), 2, '0', STR_PAD_LEFT) . $value;
}

function crc16(string $payload): string
{
    $crc = 0xffff;
    $len = strlen($payload);
    for ($i = 0; $i < $len; $i++) {
        $crc ^= ord($payload[$i]) << 8;
        for ($j = 0; $j < 8; $j++) {
            $crc = ($crc & 0x8000) ? (($crc << 1) ^ 0x1021) & 0xffff : ($crc << 1) & 0xffff;
        }
    }
    return strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
}

function build_pix_payload(array $config, int $amountCentavos, string $txid): string
{
    $pixKey = (string) ($config['pix_key'] ?? 'rifa@exemplo.com');
    $merchantName = sanitize_pix_text((string) ($config['pix_nome'] ?? 'RECEBEDOR'), 25) ?: 'RECEBEDOR';
    $merchantCity = sanitize_pix_text((string) ($config['pix_cidade'] ?? 'BRASIL'), 15) ?: 'BRASIL';
    $merchantAccount = tlv('00', 'br.gov.bcb.pix') . tlv('01', $pixKey);
    $additional = tlv('05', sanitize_pix_text($txid, 25));
    $amount = number_format($amountCentavos / 100, 2, '.', '');
    $parts = implode('', [
        tlv('00', '01'),
        tlv('26', $merchantAccount),
        tlv('52', '0000'),
        tlv('53', '986'),
        tlv('54', $amount),
        tlv('58', 'BR'),
        tlv('59', $merchantName),
        tlv('60', $merchantCity),
        tlv('62', $additional),
    ]);
    $toCrc = $parts . '6304';
    return $toCrc . crc16($toCrc);
}

function app_base_url(): string
{
    $configured = rtrim(trim((string) config_value('site_url', '')), '/');
    if ($configured !== '') {
        return $configured;
    }

    $https = ($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off';
    $scheme = $https ? 'https' : 'http';
    $host = preg_replace('/[^A-Za-z0-9.:-]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'rifasolidaria.bitdigital.com.br')) ?: 'rifasolidaria.bitdigital.com.br';
    $scriptDir = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')));
    $root = preg_replace('#/api$#', '', rtrim($scriptDir, '/')) ?: '';
    return $scheme . '://' . $host . $root;
}

function h(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function format_money_email(int $centavos): string
{
    return 'R$ ' . number_format($centavos / 100, 2, ',', '.');
}

function email_header_text(string $value): string
{
    return trim(str_replace(["\r", "\n"], '', $value));
}

function ticket_codes(array $order, array $tickets): array
{
    return array_map(
        static fn (int $numero): string => (string) $order['codigo'] . '-' . str_pad((string) $numero, 4, '0', STR_PAD_LEFT),
        $tickets
    );
}

function send_html_mail(string $to, string $subject, string $html): bool
{
    if ((string) config_value('mail_enabled', '1') === '0') {
        return false;
    }
    if (!function_exists('mail')) {
        return false;
    }
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $host = preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'bitdigital.com.br'));
    $from = trim((string) config_value('mail_from', 'nao-responda@bitdigital.com.br'));
    if (!filter_var($from, FILTER_VALIDATE_EMAIL)) {
        $from = 'nao-responda@' . ($host ?: 'bitdigital.com.br');
    }
    $fromName = email_header_text((string) config_value('mail_from_name', 'Rifa Solidaria'));
    $replyTo = trim((string) config_value('mail_reply_to', $from));
    if (!filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $replyTo = $from;
    }

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . $fromName . ' <' . $from . '>',
        'Reply-To: ' . $replyTo,
        'X-Mailer: PHP/' . phpversion(),
    ];

    $encodedSubject = '=?UTF-8?B?' . base64_encode(email_header_text($subject)) . '?=';
    return @mail($to, $encodedSubject, $html, implode("\r\n", $headers));
}

function send_order_confirmation_email(array $order, array $tickets, array $config): bool
{
    $codes = ticket_codes($order, $tickets);
    $receiptUrl = app_base_url() . '/comprovante/' . rawurlencode((string) $order['share_token']);
    $codeItems = implode('', array_map(static fn (string $code): string => '<li style="margin:4px 0;font-family:monospace">' . h($code) . '</li>', $codes));
    $subject = 'Pagamento confirmado - ' . (string) ($config['nome'] ?? 'Rifa Solidaria');
    $html = '<!doctype html><html><body style="margin:0;background:#f3fbf5;font-family:Arial,sans-serif;color:#052d1b">'
        . '<div style="max-width:640px;margin:0 auto;padding:28px 18px">'
        . '<div style="background:#ffffff;border:1px solid #c8ead4;border-radius:16px;padding:24px">'
        . '<h1 style="margin:0 0 8px;font-size:24px;color:#009750">Pagamento confirmado</h1>'
        . '<p style="font-size:16px;line-height:1.5">Ola, <strong>' . h($order['comprador_nome']) . '</strong>. Seu pedido foi confirmado e suas cotas ja estao reservadas.</p>'
        . '<div style="background:#ecfdf2;border-radius:12px;padding:16px;margin:18px 0">'
        . '<p style="margin:0 0 6px"><strong>Pedido:</strong> ' . h($order['codigo']) . '</p>'
        . '<p style="margin:0 0 6px"><strong>Quantidade:</strong> ' . h((string) count($tickets)) . ' cota(s)</p>'
        . '<p style="margin:0"><strong>Valor:</strong> ' . h(format_money_email((int) $order['valor_total_centavos'])) . '</p>'
        . '</div>'
        . '<h2 style="font-size:17px;margin:18px 0 8px">Codigos das suas cotas</h2>'
        . '<ul style="padding-left:20px;margin:0 0 22px">' . $codeItems . '</ul>'
        . '<p style="margin:0 0 18px">Guarde este e-mail. Voce tambem pode abrir seu comprovante pelo botao abaixo.</p>'
        . '<p style="margin:0 0 18px"><a href="' . h($receiptUrl) . '" style="display:inline-block;background:#009750;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:bold">Abrir comprovante</a></p>'
        . '<p style="font-size:12px;line-height:1.5;color:#577267;margin:0">Se o botao nao abrir, copie este link:<br><a href="' . h($receiptUrl) . '" style="color:#007f46">' . h($receiptUrl) . '</a></p>'
        . '</div></div></body></html>';

    $sent = send_html_mail((string) $order['email'], $subject, $html);
    if (!$sent) {
        error_log('Falha ao enviar comprovante do pedido ' . (string) ($order['codigo'] ?? ''));
    }
    return $sent;
}

function generate_order_code(): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $code = '';
    for ($i = 0; $i < 6; $i++) {
        $code .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return 'RIFA-' . $code;
}

function public_summary(): void
{
    $config = get_config_row();
    $sold = (int) db()->query('SELECT count(*) FROM public.tickets')->fetchColumn();
    $draw = get_draw_row('WHERE d.publicado = true ORDER BY d.executado_em DESC LIMIT 1');
    respond(['config' => $config, 'sold' => $sold, 'draw' => $draw]);
}

function create_order(): void
{
    require_method('POST');
    $input = read_json();
    $qty = (int) ($input['qtd_cotas'] ?? 0);
    $nome = trim((string) ($input['comprador_nome'] ?? ''));
    $cpfHash = strtolower(trim((string) ($input['cpf_hash'] ?? '')));
    $cpfMascarado = trim((string) ($input['cpf_mascarado'] ?? ''));
    $telefone = trim((string) ($input['telefone'] ?? ''));
    $email = strtolower(trim((string) ($input['email'] ?? '')));

    if ($qty < 1 || $qty > 1000) {
        fail('Quantidade de cotas invalida.');
    }
    if (strlen($nome) < 3 || strlen($nome) > 120) {
        fail('Nome invalido.');
    }
    if (!preg_match('/^[a-f0-9]{64}$/', $cpfHash)) {
        fail('CPF invalido.');
    }
    if ($cpfMascarado === '' || strlen($cpfMascarado) > 20) {
        fail('CPF invalido.');
    }
    if (strlen(preg_replace('/\D/', '', $telefone) ?? '') < 10) {
        fail('Telefone invalido.');
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('E-mail invalido.');
    }

    $config = get_config_row();
    $total = $qty * (int) $config['valor_cota_centavos'];
    $codigo = generate_order_code();
    $pixPayload = build_pix_payload($config, $total, str_replace('-', '', $codigo));

    for ($attempt = 0; $attempt < 5; $attempt++) {
        try {
            $row = one(
                'INSERT INTO public.orders (codigo, comprador_nome, cpf_hash, cpf_mascarado, telefone, email, qtd_cotas, valor_total_centavos, pix_payload, status)
                 VALUES (:codigo, :nome, :cpf_hash, :cpf_mascarado, :telefone, :email, :qtd, :total, :pix, :status)
                 RETURNING id, codigo, comprador_nome, qtd_cotas, valor_total_centavos, pix_payload, share_token, status',
                [
                    ':codigo' => $codigo,
                    ':nome' => $nome,
                    ':cpf_hash' => $cpfHash,
                    ':cpf_mascarado' => $cpfMascarado,
                    ':telefone' => $telefone,
                    ':email' => $email,
                    ':qtd' => $qty,
                    ':total' => $total,
                    ':pix' => $pixPayload,
                    ':status' => 'pendente',
                ]
            );
            respond(cast_row($row));
        } catch (PDOException $e) {
            if (!str_contains($e->getMessage(), 'duplicate key') || $attempt === 4) {
                throw $e;
            }
            $codigo = generate_order_code();
            $pixPayload = build_pix_payload($config, $total, str_replace('-', '', $codigo));
        }
    }
}

function get_payment_order(): void
{
    $id = (string) ($_GET['id'] ?? '');
    if (!preg_match('/^[0-9a-f-]{36}$/i', $id)) {
        fail('Pedido invalido.');
    }
    $row = cast_row(one(
        'SELECT id, codigo, comprador_nome, qtd_cotas, valor_total_centavos, pix_payload, share_token, status
         FROM public.orders
         WHERE id = :id
         LIMIT 1',
        [':id' => $id]
    ));
    respond($row);
}

function mark_pending(): void
{
    require_method('POST');
    $input = read_json();
    $id = (string) ($input['id'] ?? '');
    if (!preg_match('/^[0-9a-f-]{36}$/i', $id)) {
        fail('Pedido invalido.');
    }
    $row = cast_row(one(
        "UPDATE public.orders
         SET status = 'aguardando'
         WHERE id = :id AND status = 'pendente'
         RETURNING id, status",
        [':id' => $id]
    ));
    respond($row ?? ['id' => $id, 'status' => 'aguardando']);
}

function receipt(): void
{
    $token = (string) ($_GET['token'] ?? '');
    if (!preg_match('/^[a-f0-9]{16,64}$/i', $token)) {
        fail('Comprovante invalido.');
    }
    $order = cast_row(one(
        'SELECT id, codigo, comprador_nome, cpf_mascarado, qtd_cotas, valor_total_centavos, status, created_at
         FROM public.orders
         WHERE share_token = :token
         LIMIT 1',
        [':token' => $token]
    ));
    $tickets = [];
    if ($order !== null) {
        $tickets = array_map(
            static fn (array $row): int => (int) $row['numero'],
            many('SELECT numero FROM public.tickets WHERE order_id = :id ORDER BY numero ASC', [':id' => $order['id']])
        );
    }
    $draw = get_draw_row('WHERE d.publicado = true ORDER BY d.executado_em DESC LIMIT 1');
    respond(['order' => $order, 'tickets' => $tickets, 'draw' => $draw]);
}

function public_result(): void
{
    $draw = get_draw_row('WHERE d.publicado = true ORDER BY d.executado_em DESC LIMIT 1');
    respond(['draw' => $draw, 'config' => get_config_row()]);
}

function login(): void
{
    require_method('POST');
    $input = read_json();
    $email = strtolower(trim((string) ($input['email'] ?? '')));
    $password = (string) ($input['password'] ?? '');
    $adminEmail = strtolower((string) config_value('admin_email', ''));
    $hash = (string) config_value('admin_password_hash', '');

    if ($adminEmail === '' || $hash === '') {
        fail('Admin nao configurado.', 500);
    }
    if (!hash_equals($adminEmail, $email) || !password_verify($password, $hash)) {
        fail('Credenciais invalidas.', 401);
    }

    respond(['token' => make_token($adminEmail), 'email' => $adminEmail]);
}

function require_valid_admin_email(string $email): string
{
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('E-mail invalido.');
    }
    return $email;
}

function require_strong_password(string $password): string
{
    if (strlen($password) < 10) {
        fail('A senha precisa ter pelo menos 10 caracteres.');
    }
    if (!preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
        fail('A senha precisa ter letras e numeros.');
    }
    return $password;
}

function require_recovery_key(string $key): string
{
    $key = trim($key);
    if (strlen($key) < 12) {
        fail('A chave de recuperacao precisa ter pelo menos 12 caracteres.');
    }
    return $key;
}

function admin_credentials(): void
{
    $session = require_admin();
    $email = strtolower((string) config_value('admin_email', $session['email'] ?? ''));
    respond([
        'email' => $email,
        'recovery_configured' => (string) config_value('admin_reset_key_hash', '') !== '',
    ]);
}

function update_admin_credentials(): void
{
    require_method('POST');
    $session = require_admin();
    $input = read_json();

    $currentPassword = (string) ($input['current_password'] ?? '');
    $currentHash = (string) config_value('admin_password_hash', '');
    if ($currentHash === '' || !password_verify($currentPassword, $currentHash)) {
        fail('Senha atual invalida.', 401);
    }

    $currentEmail = strtolower((string) config_value('admin_email', $session['email'] ?? ''));
    $updates = [];

    $email = trim((string) ($input['email'] ?? $currentEmail));
    if ($email !== '' && strtolower($email) !== $currentEmail) {
        $updates['admin_email'] = require_valid_admin_email($email);
    }

    $newPassword = (string) ($input['new_password'] ?? '');
    if ($newPassword !== '') {
        $confirmPassword = (string) ($input['confirm_password'] ?? '');
        if (!hash_equals($newPassword, $confirmPassword)) {
            fail('As senhas nao conferem.');
        }
        $updates['admin_password_hash'] = password_hash(require_strong_password($newPassword), PASSWORD_DEFAULT);
    }

    $recoveryKey = (string) ($input['recovery_key'] ?? '');
    if (trim($recoveryKey) !== '') {
        $updates['admin_reset_key_hash'] = password_hash(require_recovery_key($recoveryKey), PASSWORD_DEFAULT);
    }

    if ($updates === []) {
        respond([
            'email' => $currentEmail,
            'recovery_configured' => (string) config_value('admin_reset_key_hash', '') !== '',
            'token' => make_token($currentEmail),
        ]);
    }

    $config = write_app_config($updates);
    $email = strtolower((string) ($config['admin_email'] ?? $currentEmail));
    try {
        one(
            'INSERT INTO public.audit_log (actor, acao, detalhes) VALUES (:actor, :acao, :detalhes)',
            [
                ':actor' => (string) ($session['email'] ?? $currentEmail),
                ':acao' => 'admin_credentials_updated',
                ':detalhes' => json_encode(['email_alterado' => isset($updates['admin_email']), 'senha_alterada' => isset($updates['admin_password_hash']), 'chave_recuperacao_alterada' => isset($updates['admin_reset_key_hash'])], JSON_UNESCAPED_SLASHES),
            ]
        );
    } catch (Throwable $e) {
        error_log((string) $e);
    }

    respond([
        'email' => $email,
        'recovery_configured' => (string) ($config['admin_reset_key_hash'] ?? '') !== '',
        'token' => make_token($email),
    ]);
}

function reset_admin_password(): void
{
    require_method('POST');
    $input = read_json();
    $email = require_valid_admin_email((string) ($input['email'] ?? ''));
    $adminEmail = strtolower((string) config_value('admin_email', ''));
    $resetHash = (string) config_value('admin_reset_key_hash', '');
    $recoveryKey = (string) ($input['recovery_key'] ?? '');
    $newPassword = (string) ($input['new_password'] ?? '');
    $confirmPassword = (string) ($input['confirm_password'] ?? '');

    if ($adminEmail === '' || $resetHash === '') {
        fail('Recuperacao de senha nao configurada.', 400);
    }
    if (!hash_equals($adminEmail, $email) || !password_verify($recoveryKey, $resetHash)) {
        usleep(300000);
        fail('Dados de recuperacao invalidos.', 401);
    }
    if (!hash_equals($newPassword, $confirmPassword)) {
        fail('As senhas nao conferem.');
    }

    write_app_config([
        'admin_password_hash' => password_hash(require_strong_password($newPassword), PASSWORD_DEFAULT),
    ]);
    try {
        one(
            'INSERT INTO public.audit_log (actor, acao, detalhes) VALUES (:actor, :acao, :detalhes)',
            [
                ':actor' => $adminEmail,
                ':acao' => 'admin_password_recovered',
                ':detalhes' => json_encode(['origem' => 'login'], JSON_UNESCAPED_SLASHES),
            ]
        );
    } catch (Throwable $e) {
        error_log((string) $e);
    }

    respond(['email' => $adminEmail]);
}

function me(): void
{
    $session = require_admin();
    respond(['email' => $session['email'] ?? 'admin']);
}

function admin_data(): void
{
    require_admin();
    $orders = array_map('cast_row', many('SELECT * FROM public.orders ORDER BY created_at DESC'));
    $ticketsByOrder = [];
    foreach (many('SELECT order_id, numero FROM public.tickets ORDER BY numero ASC') as $ticket) {
        $orderId = (string) $ticket['order_id'];
        $ticketsByOrder[$orderId] ??= [];
        $ticketsByOrder[$orderId][] = (int) $ticket['numero'];
    }
    foreach ($orders as &$order) {
        $order['tickets'] = $ticketsByOrder[(string) $order['id']] ?? [];
    }
    unset($order);
    $draw = get_draw_row('ORDER BY d.executado_em DESC LIMIT 1', [], true);
    respond(['config' => get_config_row(), 'orders' => $orders, 'draw' => $draw]);
}

function update_config(): void
{
    require_method('POST');
    require_admin();
    $input = read_json();
    $current = get_config_row();
    $row = cast_row(one(
        'UPDATE public.raffle_config
         SET nome = :nome,
             premio = :premio,
             descricao = :descricao,
             imagem_url = :imagem_url,
             total_cotas = :total_cotas,
             valor_cota_centavos = :valor_cota_centavos,
             data_sorteio = :data_sorteio,
             pix_key = :pix_key,
             pix_nome = :pix_nome,
             pix_cidade = :pix_cidade
         WHERE id = :id
         RETURNING *',
        [
            ':id' => $current['id'],
            ':nome' => trim((string) ($input['nome'] ?? $current['nome'])),
            ':premio' => trim((string) ($input['premio'] ?? $current['premio'])),
            ':descricao' => (string) ($input['descricao'] ?? ($current['descricao'] ?? '')),
            ':imagem_url' => trim((string) ($input['imagem_url'] ?? ($current['imagem_url'] ?? ''))) ?: null,
            ':total_cotas' => max(1, (int) ($input['total_cotas'] ?? $current['total_cotas'])),
            ':valor_cota_centavos' => max(1, (int) ($input['valor_cota_centavos'] ?? $current['valor_cota_centavos'])),
            ':data_sorteio' => (string) ($input['data_sorteio'] ?? $current['data_sorteio']),
            ':pix_key' => (string) ($input['pix_key'] ?? ($current['pix_key'] ?? '')),
            ':pix_nome' => (string) ($input['pix_nome'] ?? ($current['pix_nome'] ?? '')),
            ':pix_cidade' => (string) ($input['pix_cidade'] ?? ($current['pix_cidade'] ?? '')),
        ]
    ));
    respond($row);
}

function upload_prize_image(): void
{
    require_method('POST');
    require_admin();
    $current = get_config_row();

    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        fail('Arquivo nao enviado.');
    }
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        fail('Falha no upload.');
    }
    if ((int) ($file['size'] ?? 0) > 8 * 1024 * 1024) {
        fail('Imagem muito grande. Envie ate 8 MB.');
    }

    $tmp = (string) $file['tmp_name'];
    $original = (string) ($file['name'] ?? 'premio.jpg');
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    $allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    if (!in_array($ext, $allowed, true)) {
        fail('Formato de imagem nao permitido.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmp) ?: '';
    if (!str_starts_with($mime, 'image/')) {
        fail('Arquivo enviado nao parece ser uma imagem.');
    }

    $dir = dirname(__DIR__) . '/uploads/raffle-images';
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        fail('Nao foi possivel criar pasta de uploads.', 500);
    }
    $name = 'premio-' . time() . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
    $dest = $dir . '/' . $name;
    if (!move_uploaded_file($tmp, $dest)) {
        fail('Nao foi possivel salvar a imagem.', 500);
    }
    chmod($dest, 0644);

    $baseUrl = rtrim((string) config_value('upload_base_url', '/uploads'), '/');
    $imageUrl = $baseUrl . '/raffle-images/' . $name;
    $row = cast_row(one(
        'UPDATE public.raffle_config SET imagem_url = :url WHERE id = :id RETURNING *',
        [':url' => $imageUrl, ':id' => $current['id']]
    ));
    respond($row);
}

function confirm_order(): void
{
    require_method('POST');
    $session = require_admin();
    $input = read_json();
    $id = (string) ($input['id'] ?? '');
    if (!preg_match('/^[0-9a-f-]{36}$/i', $id)) {
        fail('Pedido invalido.');
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $order = one('SELECT * FROM public.orders WHERE id = :id FOR UPDATE', [':id' => $id]);
        if ($order === null) {
            fail('Pedido nao encontrado.', 404);
        }
        $order = cast_row($order);
        if ($order['status'] === 'confirmado') {
            $pdo->commit();
            $hasEmail = trim((string) ($order['email'] ?? '')) !== '';
            respond(['ok' => true, 'email_informado' => $hasEmail]);
        }

        $config = get_config_row();
        $next = (int) $pdo->query('SELECT COALESCE(MAX(numero), 0) FROM public.tickets')->fetchColumn();
        if ($next + (int) $order['qtd_cotas'] > (int) $config['total_cotas']) {
            fail('Nao ha cotas suficientes disponiveis.', 409);
        }

        $assignedTickets = [];
        $insert = $pdo->prepare('INSERT INTO public.tickets (numero, order_id) VALUES (:numero, :order_id)');
        for ($i = 0; $i < (int) $order['qtd_cotas']; $i++) {
            $next++;
            $insert->execute([':numero' => $next, ':order_id' => $id]);
            $assignedTickets[] = $next;
        }

        $stmt = $pdo->prepare(
            "UPDATE public.orders
             SET status = 'confirmado', confirmed_at = now(), confirmed_by = :actor
             WHERE id = :id"
        );
        $stmt->execute([':actor' => (string) ($session['email'] ?? 'admin'), ':id' => $id]);

        $audit = $pdo->prepare('INSERT INTO public.audit_log (actor, acao, detalhes) VALUES (:actor, :acao, :detalhes)');
        $audit->execute([
            ':actor' => (string) ($session['email'] ?? 'admin'),
            ':acao' => 'confirm_order',
            ':detalhes' => json_encode(['order_id' => $id, 'qtd_cotas' => $order['qtd_cotas']], JSON_UNESCAPED_SLASHES),
        ]);

        $pdo->commit();

        $hasEmail = trim((string) ($order['email'] ?? '')) !== '';
        $emailSent = $hasEmail ? send_order_confirmation_email($order, $assignedTickets, $config) : false;
        respond(['ok' => true, 'email_informado' => $hasEmail, 'email_enviado' => $emailSent]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function cancel_order(): void
{
    require_method('POST');
    require_admin();
    $input = read_json();
    $id = (string) ($input['id'] ?? '');
    if (!preg_match('/^[0-9a-f-]{36}$/i', $id)) {
        fail('Pedido invalido.');
    }
    $row = cast_row(one(
        "UPDATE public.orders
         SET status = 'cancelado'
         WHERE id = :id AND status <> 'confirmado'
         RETURNING id, status",
        [':id' => $id]
    ));
    if ($row === null) {
        fail('Pedido confirmado nao pode ser cancelado por aqui.', 409);
    }
    respond($row);
}

function search_tickets(): void
{
    require_admin();
    $query = trim((string) ($_GET['q'] ?? ''));
    if ($query === '') {
        respond([]);
    }

    $expr = ticket_code_expr();
    $like = '%' . strtolower($query) . '%';
    $digits = preg_replace('/\D/', '', $query) ?? '';
    $params = [':like' => $like];
    $numeric = '';
    if ($digits !== '') {
        $params[':numero'] = (int) $digits;
        $numeric = ' OR t.numero = :numero';
    }

    $rows = many(
        "SELECT t.numero,
                {$expr} AS codigo_cota,
                t.order_id,
                o.codigo AS order_codigo,
                o.comprador_nome,
                o.telefone,
                o.email,
                o.qtd_cotas
         FROM public.tickets t
         JOIN public.orders o ON o.id = t.order_id
         WHERE o.status = 'confirmado'
           AND (
                lower(o.comprador_nome) LIKE :like
                OR lower(o.codigo) LIKE :like
                OR lower({$expr}) LIKE :like
                {$numeric}
           )
         ORDER BY t.numero ASC
         LIMIT 30",
        $params
    );
    respond(array_map('cast_row', $rows));
}

function reset_raffle(): void
{
    require_method('POST');
    $session = require_admin();
    $input = read_json();
    $confirm = trim((string) ($input['confirmacao'] ?? ''));
    $normalized = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $confirm);
    if (strtoupper($normalized === false ? $confirm : $normalized) !== 'LANCAR') {
        fail('Digite LANÇAR para confirmar a preparacao da rifa.', 422);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $counts = [
            'pedidos' => (int) $pdo->query('SELECT count(*) FROM public.orders')->fetchColumn(),
            'cotas' => (int) $pdo->query('SELECT count(*) FROM public.tickets')->fetchColumn(),
            'resultados' => (int) $pdo->query('SELECT count(*) FROM public.draw_result')->fetchColumn(),
        ];

        $pdo->exec('DELETE FROM public.draw_result');
        $pdo->exec('DELETE FROM public.orders');

        $audit = $pdo->prepare('INSERT INTO public.audit_log (actor, acao, detalhes) VALUES (:actor, :acao, :detalhes)');
        $audit->execute([
            ':actor' => (string) ($session['email'] ?? 'admin'),
            ':acao' => 'reset_raffle',
            ':detalhes' => json_encode($counts, JSON_UNESCAPED_SLASHES),
        ]);

        $pdo->commit();
        respond(['ok' => true, 'removidos' => $counts]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function create_draw(): void
{
    require_method('POST');
    require_admin();
    $input = read_json();
    if (one('SELECT id FROM public.draw_result LIMIT 1') !== null) {
        fail('Sorteio ja realizado.', 409);
    }
    $totalSold = (int) db()->query('SELECT count(*) FROM public.tickets')->fetchColumn();
    if ($totalSold < 1) {
        fail('Nenhuma cota confirmada ainda.', 409);
    }

    $modo = trim((string) ($input['modo'] ?? ''));
    $seed = trim((string) ($input['seed'] ?? ''));
    $fonte = trim((string) ($input['fonte_seed'] ?? ''));

    if ($modo === '') {
        $modo = isset($input['ticket_numero']) ? 'papel_fisico' : ($seed !== '' ? 'seed_publica' : 'cesta_digital');
    }

    if ($modo === 'cesta_digital') {
        $offset = random_int(0, $totalSold - 1);
        $ticket = ticket_by_offset($offset);
        if ($ticket === null) {
            fail('Nao foi possivel escolher uma cota.', 500);
        }
        $seed = 'CESTA-' . date('YmdHis') . '-' . bin2hex(random_bytes(8));
        respond(save_draw_result($ticket, $seed, 'Cesta digital'));
    }

    if ($modo === 'papel_fisico') {
        $numero = (int) ($input['ticket_numero'] ?? 0);
        if ($numero < 1) {
            fail('Selecione a cota sorteada.');
        }
        $ticket = ticket_by_number($numero);
        if ($ticket === null) {
            fail('Cota nao encontrada ou nao confirmada.', 404);
        }
        $codigo = (string) ($ticket['codigo_cota'] ?? str_pad((string) $numero, 4, '0', STR_PAD_LEFT));
        respond(save_draw_result($ticket, 'PAPEL-' . $codigo, 'Cesta fisica conferida no painel'));
    }

    if ($seed === '' || $fonte === '') {
        fail('Seed e fonte sao obrigatorias.');
    }

    $bytes = hash('sha256', $seed, true);
    $mod = 0;
    for ($i = 0; $i < 8; $i++) {
        $mod = (($mod * 256) + ord($bytes[$i])) % $totalSold;
    }
    $ticket = ticket_by_offset($mod);
    if ($ticket === null) {
        fail('Nao foi possivel escolher uma cota.', 500);
    }
    respond(save_draw_result($ticket, $seed, $fonte));
}

function toggle_publish(): void
{
    require_method('POST');
    require_admin();
    $input = read_json();
    $id = (string) ($input['id'] ?? '');
    $publicado = (bool) ($input['publicado'] ?? false);
    if (!preg_match('/^[0-9a-f-]{36}$/i', $id)) {
        fail('Sorteio invalido.');
    }
    $row = cast_row(one(
        'UPDATE public.draw_result SET publicado = :publicado WHERE id = :id RETURNING *',
        [':publicado' => $publicado, ':id' => $id]
    ));
    respond($row ? get_draw_row('WHERE d.id = :id LIMIT 1', [':id' => $row['id']], true) : null);
}

function upload_video(): void
{
    require_method('POST');
    require_admin();
    $drawId = (string) ($_POST['draw_id'] ?? '');
    if (!preg_match('/^[0-9a-f-]{36}$/i', $drawId)) {
        fail('Sorteio invalido.');
    }
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        fail('Arquivo nao enviado.');
    }
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        fail('Falha no upload.');
    }

    $tmp = (string) $file['tmp_name'];
    $original = (string) ($file['name'] ?? 'video.mp4');
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    $allowed = ['mp4', 'mov', 'webm', 'm4v', 'avi'];
    if (!in_array($ext, $allowed, true)) {
        fail('Formato de video nao permitido.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmp) ?: '';
    if (!str_starts_with($mime, 'video/')) {
        fail('Arquivo enviado nao parece ser um video.');
    }

    $dir = dirname(__DIR__) . '/uploads/raffle-videos';
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        fail('Nao foi possivel criar pasta de uploads.', 500);
    }
    $name = 'sorteio-' . time() . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
    $dest = $dir . '/' . $name;
    if (!move_uploaded_file($tmp, $dest)) {
        fail('Nao foi possivel salvar o video.', 500);
    }
    chmod($dest, 0644);

    $baseUrl = rtrim((string) config_value('upload_base_url', '/uploads'), '/');
    $videoUrl = $baseUrl . '/raffle-videos/' . $name;
    $row = cast_row(one(
        'UPDATE public.draw_result SET video_url = :url WHERE id = :id RETURNING *',
        [':url' => $videoUrl, ':id' => $drawId]
    ));
    respond($row ? get_draw_row('WHERE d.id = :id LIMIT 1', [':id' => $row['id']], true) : null);
}

try {
    $action = (string) ($_GET['action'] ?? 'health');
    match ($action) {
        'health' => respond(['status' => 'ok']),
        'summary' => public_summary(),
        'config' => respond(get_config_row()),
        'create_order' => create_order(),
        'payment_order' => get_payment_order(),
        'mark_pending' => mark_pending(),
        'receipt' => receipt(),
        'result' => public_result(),
        'login' => login(),
        'reset_admin_password' => reset_admin_password(),
        'me' => me(),
        'admin_credentials' => admin_credentials(),
        'update_admin_credentials' => update_admin_credentials(),
        'admin_data' => admin_data(),
        'update_config' => update_config(),
        'confirm_order' => confirm_order(),
        'cancel_order' => cancel_order(),
        'search_tickets' => search_tickets(),
        'reset_raffle' => reset_raffle(),
        'create_draw' => create_draw(),
        'toggle_publish' => toggle_publish(),
        'upload_prize_image' => upload_prize_image(),
        'upload_video' => upload_video(),
        default => fail('Endpoint nao encontrado.', 404),
    };
} catch (HttpError $e) {
    http_response_code($e->status);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    error_log((string) $e);
    http_response_code(500);
    echo json_encode(['error' => 'Erro interno.'], JSON_UNESCAPED_SLASHES);
}
