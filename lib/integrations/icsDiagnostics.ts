// O endereço iCal é fácil de errar: o Google mostra três links diferentes na
// mesma tela, e o mais natural — copiar a barra de endereços — não é nenhum
// deles. Quando isso acontece, "a URL não devolveu um calendário" é verdade e
// não ajuda em nada. Estas funções nomeiam o erro específico.

const GOOGLE_UI_PATHS = [/^\/calendar\/u\/\d+/, /^\/calendar\/r/, /^\/calendar\/?$/];

/** Erro detectável antes de qualquer ida à rede. Null quer dizer "parece uma
 *  URL de calendário; siga em frente". */
export function diagnoseIcsUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'informe o endereço do calendário';

  let url: URL;
  try {
    url = new URL(value.replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return 'isso não parece uma URL. Cole o endereço inteiro, começando com https://';
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return 'o endereço precisa começar com https://';
  }

  if (url.hostname === 'calendar.google.com') {
    if (GOOGLE_UI_PATHS.some((re) => re.test(url.pathname))) {
      return 'esse é o endereço da página do Google Agenda, não o do calendário. No Google Agenda: Configurações → clique na agenda à esquerda → "Integrar agenda" → copie o "Endereço secreto no formato iCal", que termina em .ics';
    }
    if (url.pathname.includes('/embed')) {
      return 'esse é o link de incorporar (embed). Na mesma tela, use o "Endereço secreto no formato iCal", que termina em .ics';
    }
    if (!url.pathname.endsWith('.ics')) {
      return 'o endereço do Google Agenda precisa terminar em .ics — procure por "Endereço secreto no formato iCal"';
    }
  }

  if (url.hostname.endsWith('outlook.office.com') || url.hostname.endsWith('outlook.live.com')) {
    if (!url.pathname.endsWith('.ics')) {
      return 'no Outlook: Configurações → Agenda → Agendas compartilhadas → Publicar, e copie o link ICS (termina em .ics)';
    }
  }

  return null;
}

/** Erro depois da resposta, quando o servidor devolveu algo que não é iCal. */
export function diagnoseIcsResponse(contentType: string | null, body: string): string {
  const type = (contentType ?? '').toLowerCase();

  // O caso mais comum: o link exige login, então o provedor manda a tela de
  // login em HTML com status 200.
  if (type.includes('text/html') || /^\s*<(!doctype|html)/i.test(body)) {
    if (/accounts\.google\.com|signin/i.test(body.slice(0, 4000))) {
      return 'o endereço pediu login em vez de devolver o calendário — ou seja, não é um endereço secreto. Use o "Endereço secreto no formato iCal", em Configurações → sua agenda → Integrar agenda';
    }
    return 'o endereço devolveu uma página web, não um calendário. Confira se copiou o link que termina em .ics';
  }

  if (type.includes('application/json')) {
    return 'o endereço devolveu JSON, não um calendário iCal';
  }

  return 'o endereço não devolveu um calendário iCal. Confira se é o link que termina em .ics';
}
