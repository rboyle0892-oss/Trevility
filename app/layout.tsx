import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trevecta Control',
  description: 'IT spend, renewal and governance control.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
