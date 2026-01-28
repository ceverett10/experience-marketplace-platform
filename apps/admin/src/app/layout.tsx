import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Experience Marketplace Admin',
  description: 'Admin dashboard for managing storefronts and content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-64 border-r bg-gray-50">
            <div className="p-6">
              <h2 className="text-lg font-semibold">Admin Dashboard</h2>
            </div>
            <nav className="px-4 py-2">
              <ul className="space-y-2">
                <li>
                  <a href="/admin" className="block px-4 py-2 rounded-md hover:bg-gray-100">
                    Dashboard
                  </a>
                </li>
                <li>
                  <a href="/admin/sites" className="block px-4 py-2 rounded-md hover:bg-gray-100">
                    Sites
                  </a>
                </li>
                <li>
                  <a href="/admin/content" className="block px-4 py-2 rounded-md hover:bg-gray-100">
                    Content
                  </a>
                </li>
                <li>
                  <a href="/admin/seo" className="block px-4 py-2 rounded-md hover:bg-gray-100">
                    SEO
                  </a>
                </li>
                <li>
                  <a href="/admin/analytics" className="block px-4 py-2 rounded-md hover:bg-gray-100">
                    Analytics
                  </a>
                </li>
              </ul>
            </nav>
          </aside>
          {/* Main content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
