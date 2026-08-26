# Segurança

## Modelo de ameaça

O daily-web foi feito para rodar **na sua própria máquina, atrás de login**,
servindo você e no máximo um punhado de pessoas de confiança. Ele **não é
multi-tenant**: não há isolamento de processo por usuário nem registro de
auditoria, e quem opera a máquina tem acesso ao banco e à chave que cifra as
credenciais de todo mundo.

**Não exponha esta app na internet aberta** achando que o login basta para
tratá-la como um serviço público. Coloque atrás de um proxy com TLS, use senhas
fortes e só dê conta a quem você confiaria o acesso à máquina.

## Credenciais

Cada pessoa cadastra as próprias credenciais de e-mail, agenda, Jira e GitHub.
Elas são guardadas cifradas com AES-256-GCM, com a chave em
`DAILY_WEB_SECRET_KEY` — que fica no ambiente do serviço, nunca no banco nem no
git. Sem a chave, a tela de configuração avisa e bloqueia o formulário em vez
de aceitar e falhar depois.

Um segredo já gravado **nunca volta para o cliente**. A tela recebe só o nome
dos campos secretos que existem, e deixar o campo em branco numa edição
significa "não mexe".

Toda conexão é resolvida pelo dono da sessão (`requireConnection`). O id de
conexão de outra pessoa não é "proibido": ele não existe para aquela sessão, e
a resposta é a mesma de um id inventado — nada revela que ele existe em outra
conta.

Isso protege um usuário do outro. **Não protege ninguém do operador da
máquina**, que pode ler a chave e o banco.

## O que já está protegido

- Senhas guardadas como hash bcrypt, nunca em texto claro.
- Sessão em cookie `httpOnly`, `secure`, `sameSite=strict`, assinada por HMAC.
- Middleware falha fechado: sem `SESSION_SECRET`, nenhum token é aceito.
- O usuário é resolvido dentro do handler, relendo o cookie — o middleware não
  injeta header de identidade, que seria superfície de spoof.
- Rate limit no login por IP, usando a última entrada do `X-Forwarded-For`
  (as anteriores são forjáveis pelo cliente).
- Login não distingue "usuário inexistente" de "senha errada" pelo tempo de
  resposta.
- A URL do iCal é restrita a `http`/`https`, e o arquivo tem limite de tamanho.
- Só campos declarados de cada módulo são gravados numa conexão.

## Arquivos públicos sem sessão

`/manifest.webmanifest`, `/sw.js`, `/icon.svg` e `/icons/*` respondem sem
login: o Chrome busca o manifest sem credenciais e registra o service worker
antes de qualquer sessão, e atrás do login eles receberiam o HTML do redirect.
Nenhum deles carrega dado de usuário.

## Limitações conhecidas

- O provedor opcional de tarefas ainda executa a CLI `mstodo` da máquina via
  `execFile` (nunca por shell), com argumentos validados em
  `lib/api/validation.ts`. Quem liga esse provedor aceita essa superfície; o
  provedor padrão, local, não executa processo nenhum.
- Não há CSRF token; a proteção vem de `sameSite=strict` no cookie.
- Não há registro de auditoria de quem fez o quê.
- O rascunho de resposta com IA envia o corpo do e-mail para a API da
  Anthropic. Sem `ANTHROPIC_API_KEY` o recurso fica desligado.

## Reportando uma vulnerabilidade

Abra uma issue descrevendo o problema sem incluir dados sensíveis, ou use
[GitHub Security Advisories](https://github.com/joaosouzacoder/daily-web/security/advisories/new)
para reporte privado.
