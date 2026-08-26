import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { AmbientBackground } from '@/components/AmbientBackground';
import { ServiceWorker } from '@/components/ServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: 'daily-web',
  description: 'Painel pessoal do dia a dia',
  appleWebApp: {
    capable: true,
    title: 'daily',
    // O iOS não lê o manifest: a barra de status precisa ser dita aqui, ou
    // ela fica clara sobre o fundo escuro da app.
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d0b14',
  // A app é um painel, não um documento: dar zoom horizontal só quebraria as
  // colunas, mas o zoom de acessibilidade continua liberado.
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AmbientBackground />
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
