import { describe, expect, it } from 'vitest';
import { diagnoseIcsResponse, diagnoseIcsUrl } from '@/lib/integrations/icsDiagnostics';

describe('diagnoseIcsUrl', () => {
  // O erro real que aconteceu: colar a barra de endereços do Google Agenda.
  // A app dizia só "não devolveu um calendário iCal", que é verdade e não
  // ajuda a consertar.
  it('reconhece o endereço da página do Google Agenda', () => {
    const erro = diagnoseIcsUrl('https://calendar.google.com/calendar/u/0');
    expect(erro).toContain('endereço da página');
    expect(erro).toContain('Endereço secreto no formato iCal');
  });

  it('reconhece outras telas do Google Agenda', () => {
    expect(diagnoseIcsUrl('https://calendar.google.com/calendar/u/1/r/week')).toContain(
      'endereço da página',
    );
    expect(diagnoseIcsUrl('https://calendar.google.com/calendar')).toContain('endereço da página');
  });

  it('reconhece o link de incorporar', () => {
    expect(diagnoseIcsUrl('https://calendar.google.com/calendar/embed?src=a')).toContain('embed');
  });

  it('cobra o .ics em link do Google que não termina nele', () => {
    expect(diagnoseIcsUrl('https://calendar.google.com/calendar/ical/a/private-x/')).toContain(
      '.ics',
    );
  });

  it('aceita o endereço secreto correto', () => {
    expect(
      diagnoseIcsUrl(
        'https://calendar.google.com/calendar/ical/a%40gmail.com/private-abc123/basic.ics',
      ),
    ).toBeNull();
  });

  it('aceita webcal e qualquer provedor com .ics', () => {
    expect(diagnoseIcsUrl('webcal://p1.fastmail.com/a/b.ics')).toBeNull();
    expect(diagnoseIcsUrl('https://nextcloud.meu.com/remote.php/dav/x')).toBeNull();
  });

  it('recusa vazio, texto solto e esquema inválido', () => {
    expect(diagnoseIcsUrl('  ')).toContain('informe');
    expect(diagnoseIcsUrl('meu calendário')).toContain('não parece uma URL');
    expect(diagnoseIcsUrl('file:///etc/passwd')).toContain('https://');
  });

  it('orienta o Outlook quando o link não termina em .ics', () => {
    expect(diagnoseIcsUrl('https://outlook.live.com/calendar/0/view/month')).toContain('Publicar');
  });
});

describe('diagnoseIcsResponse', () => {
  // Foi o que aconteceu de verdade: 200 OK com 930KB da tela de login.
  it('reconhece a tela de login do Google devolvida com 200', () => {
    const html = '<!doctype html><html><head><base href="https://accounts.google.com/v3/signin/">';
    expect(diagnoseIcsResponse('text/html; charset=utf-8', html)).toContain('pediu login');
  });

  it('reconhece HTML genérico', () => {
    expect(diagnoseIcsResponse('text/html', '<html><body>oi</body></html>')).toContain(
      'página web',
    );
  });

  it('reconhece HTML mesmo sem content-type', () => {
    expect(diagnoseIcsResponse(null, '<!DOCTYPE html><html>')).toContain('página web');
  });

  it('reconhece JSON', () => {
    expect(diagnoseIcsResponse('application/json', '{"erro":1}')).toContain('JSON');
  });

  it('cai num aviso genérico útil para o resto', () => {
    expect(diagnoseIcsResponse('text/plain', 'qualquer coisa')).toContain('.ics');
  });
});
