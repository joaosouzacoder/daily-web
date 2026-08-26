# Segurança

## Modelo de ameaça

O daily-web foi feito para rodar **na sua própria máquina, atrás de login**,
servindo você e no máximo um punhado de pessoas de confiança. Ele **não é
multi-tenant**: não há isolamento de processo por usuário, nem auditoria, nem
qualquer garantia de que um usuário não consiga afetar o ambiente de outro.

Isso importa porque a app **executa CLIs do sistema** (`himalaya`, `gcalcli`,
`jira`, `mstodo`, `ghpending`) com dados que vêm da requisição — ids de e-mail,
nomes de pasta, títulos de tarefa, corpo de resposta. Os argumentos passam por
`execFile` (nunca por shell) e são validados em `lib/api/validation.ts`, mas
quem tem sessão válida consegue, por construção, fazer o servidor rodar essas
CLIs com as credenciais da máquina.

**Não exponha esta app na internet aberta** achando que o login basta para
tratá-la como um serviço público. Coloque atrás de um proxy com TLS, use uma
senha forte e só dê conta a quem você daria acesso ao shell da máquina.

## O que já está protegido

- Senhas guardadas como hash bcrypt, nunca em texto claro.
- Sessão em cookie `httpOnly`, `secure`, `sameSite=strict`, assinada por HMAC.
- Middleware falha fechado: sem `SESSION_SECRET`, nenhum token é aceito.
- Rate limit no login por IP, usando a última entrada do `X-Forwarded-For`
  (as anteriores são forjáveis pelo cliente).
- Login não distingue "usuário inexistente" de "senha errada" pelo tempo de
  resposta.
- Argumentos de CLI validados, e valores de texto livre passados na forma
  `--flag=valor` para não serem reinterpretados como flags.

## Limitações conhecidas

- Até o estágio 2 do multiusuário, **todo usuário que loga vê os dados da
  máquina** — as credenciais das integrações ainda são globais, não por
  usuário. Ver `docs/superpowers/specs/2026-08-26-multiusuario-design.md`.
- Não há CSRF token; a proteção vem de `sameSite=strict` no cookie.
- Não há registro de auditoria de quem fez o quê.

## Reportando uma vulnerabilidade

Abra uma issue descrevendo o problema sem incluir dados sensíveis, ou use
[GitHub Security Advisories](https://github.com/joaosouzacoder/daily-web/security/advisories/new)
para reporte privado.
