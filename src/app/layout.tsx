import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = { title: 'ChangeRelay: change the plan once', description: 'Reschedule an event once. See the impact. Keep Calendar, Sheets and Gmail aligned.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#FBFAF7' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
