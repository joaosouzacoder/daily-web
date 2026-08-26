import type { MetadataRoute } from 'next';

// O painel fica aberto o dia inteiro num monitor à parte: instalado como app,
// ele ganha janela própria, sem barra de endereço nem abas competindo por
// espaço. É também a base do PWA — só falta ampliar o service worker.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'daily-web',
    short_name: 'daily',
    description: 'E-mail, agenda, pull requests, Jira, tarefas e pomodoro numa página só.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0d0b14',
    theme_color: '#0d0b14',
    categories: ['productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A máscara do Android recorta o ícone; a versão maskable tem o
      // desenho encolhido para dentro da área segura.
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
