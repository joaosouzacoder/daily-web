// Um erro de IMAP cru ("Invalid credentials (Failure)") não diz a ninguém o
// que fazer. Como configurar a própria caixa é a primeira coisa que cada
// pessoa faz na app, a mensagem precisa apontar o próximo passo.

interface ErrorLike {
  message?: string;
  code?: string;
  responseText?: string;
  authenticationFailed?: boolean;
}

function textOf(err: unknown): string {
  if (typeof err === 'string') return err;
  const e = (err ?? {}) as ErrorLike;
  return [e.responseText, e.message].filter(Boolean).join(' ');
}

const RULES: { match: RegExp; message: string }[] = [
  {
    match: /application-specific password required/i,
    message:
      'esta conta exige senha de app. Ative a verificação em duas etapas e gere uma em myaccount.google.com/apppasswords',
  },
  {
    match: /invalid credentials|authenticationfailed|auth.*fail|login.*fail|username and password not accepted/i,
    message: 'usuário ou senha recusados. Confira o endereço e use a senha de app, não a da conta',
  },
  {
    match: /\[ALERT\].*web login required|please log in via your web browser/i,
    message: 'o provedor pediu login pelo navegador antes de liberar o IMAP',
  },
  {
    match: /imap.*disabled|imap access is disabled/i,
    message: 'o IMAP está desativado nas configurações da conta',
  },
  {
    match: /ENOTFOUND|EAI_AGAIN|getaddrinfo/i,
    message: 'servidor não encontrado. Confira o endereço do IMAP',
  },
  { match: /ECONNREFUSED/i, message: 'conexão recusada. Confira o host e a porta' },
  {
    match: /ETIMEDOUT|ESOCKETTIMEDOUT|timed? ?out/i,
    message: 'o servidor não respondeu a tempo',
  },
  {
    match: /self.signed|unable to verify|CERT_|ERR_TLS/i,
    message: 'o certificado TLS do servidor não pôde ser verificado',
  },
  {
    match: /wrong version number|ssl routines/i,
    message: 'porta e criptografia não combinam. 993 para IMAP e 465 ou 587 para SMTP',
  },
];

export function describeMailError(err: unknown): string {
  const raw = textOf(err).trim();
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.message;
  }
  return raw || 'falha ao falar com o servidor';
}
