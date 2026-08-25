import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { AmbientBackground } from '@/components/AmbientBackground';
import './globals.css';

export const metadata: Metadata = {
  title: 'daily-web',
  description: 'Painel pessoal do dia a dia',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AmbientBackground />
        {children}
      </body>
    </html>
  );
}
