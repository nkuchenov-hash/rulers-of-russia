import './globals.css';
import './site-min-font.css';
import './inspector.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Правители России',
  description: 'Интерактивная хронология правителей России'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
