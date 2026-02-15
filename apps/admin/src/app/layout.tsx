'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import './globals.css';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: string;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/sites', label: 'Sites', icon: '🌐' },
  { href: '/opportunities', label: 'Opportunities', icon: '🔍' },
  { href: '/domains', label: 'Domains', icon: '🌍' },
  { href: '/partners', label: 'Partners', icon: '🤝' },
  { href: '/tasks', label: 'Tasks', icon: '✅' },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: '📈',
    children: [
      { href: '/analytics', label: 'Overview', icon: '📊' },
      { href: '/analytics/traffic', label: 'Traffic', icon: '👥' },
      { href: '/analytics/search', label: 'Search', icon: '🔍' },
      { href: '/analytics/blockers', label: 'Blockers', icon: '🚧' },
    ],
  },
  {
    href: '/operations',
    label: 'Operations',
    icon: '⚡',
    children: [
      { href: '/operations', label: 'Dashboard', icon: '📈' },
      { href: '/operations/microsites', label: 'Microsites', icon: '🏢' },
      { href: '/operations/paid-opportunities', label: 'Paid Traffic', icon: '💰' },
      { href: '/operations/bidding', label: 'Bidding Engine', icon: '🎯' },
      { href: '/operations/jobs', label: 'Jobs', icon: '📋' },
      { href: '/operations/errors', label: 'Errors', icon: '🚨' },
      { href: '/operations/schedules', label: 'Schedules', icon: '🕐' },
    ],
  },
  { href: '/content', label: 'Content', icon: '📝' },
  { href: '/social', label: 'Social', icon: '📱' },
  { href: '/seo-issues', label: 'SEO Issues', icon: '🎯' },
  { href: '/link-building', label: 'Link Building', icon: '🔗' },
  { href: '/users', label: 'Users', icon: '👤' },
  { href: '/settings', label: 'Settings', icon: '🛠️' },
];

// Flat list for breadcrumb lookup
const allNavItems = navItems.flatMap((item) => (item.children ? [item, ...item.children] : [item]));

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(
    pathname?.startsWith('/analytics')
      ? '/analytics'
      : pathname?.startsWith('/operations')
        ? '/operations'
        : null
  );
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);

  const basePath = process.env['NEXT_PUBLIC_BASE_PATH'] || '';

  // Fetch current user session
  useEffect(() => {
    if (pathname === '/login') return;
    fetch(`${basePath}/api/auth/session`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, [pathname, basePath]);

  const handleSignOut = useCallback(async () => {
    await fetch(`${basePath}/api/auth/logout`, { method: 'POST' });
    setUser(null);
    router.push('/login');
  }, [basePath, router]);

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname?.startsWith(href));

  const toggleGroup = (href: string) => {
    setExpandedGroup(expandedGroup === href ? null : href);
  };

  // Login page gets a minimal layout (no sidebar/header)
  if (pathname === '/login') {
    return (
      <html lang="en">
        <body className="min-h-screen bg-slate-50 font-sans antialiased">{children}</body>
      </html>
    );
  }

  const userInitial = user?.name?.charAt(0)?.toUpperCase() || 'A';

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <div className="min-h-screen">
          {/* Mobile sidebar backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <aside
            className={`fixed top-0 left-0 z-50 h-full w-64 bg-slate-900 transform transition-transform duration-200 lg:translate-x-0 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex flex-col h-full">
              {/* Logo */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-sky-400">holibob</span>
                  <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded">Admin</span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden p-1 text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Navigation */}
              <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  if (item.children) {
                    // Collapsible group
                    const groupActive = isActive(item.href);
                    const isExpanded = expandedGroup === item.href || groupActive;

                    return (
                      <div key={item.href}>
                        <button
                          onClick={() => toggleGroup(item.href)}
                          className={`flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                            groupActive
                              ? 'bg-sky-600/20 text-sky-300'
                              : 'text-slate-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span>{item.icon}</span>
                            {item.label}
                          </div>
                          <span
                            className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          >
                            ›
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="ml-4 mt-1 space-y-0.5">
                            {item.children.map((child) => {
                              const childActive =
                                pathname === child.href ||
                                (child.href !== '/operations' && pathname?.startsWith(child.href));

                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors ${
                                    childActive
                                      ? 'bg-sky-600 text-white'
                                      : 'text-slate-400 hover:bg-white/10 hover:text-white'
                                  }`}
                                >
                                  <span className="text-xs">{child.icon}</span>
                                  {child.label}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Regular nav item
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span>{item.icon}</span>
                        {item.label}
                      </div>
                      {item.badge && (
                        <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              {/* User section */}
              <div className="px-3 py-4 border-t border-white/10">
                {user && (
                  <div className="px-4 py-2 mb-2">
                    <p className="text-sm font-medium text-white truncate">{user.name}</p>
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                  </div>
                )}
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <span>🚪</span>
                  <span className="text-sm font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="lg:pl-64">
            {/* Top header */}
            <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
              <div className="flex items-center justify-between px-4 lg:px-8 py-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    ☰
                  </button>

                  {/* Breadcrumb */}
                  <nav className="hidden sm:flex items-center gap-2 text-sm">
                    <Link href="/" className="text-slate-500 hover:text-slate-700">
                      Admin
                    </Link>
                    <span className="text-slate-400">›</span>
                    <span className="text-slate-900 font-medium">
                      {allNavItems.find(
                        (item) =>
                          pathname === item.href ||
                          (item.href !== '/' && pathname?.startsWith(item.href))
                      )?.label || 'Dashboard'}
                    </span>
                  </nav>
                </div>

                <div className="flex items-center gap-3">
                  <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg relative">
                    🔔
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                  </button>
                  <div
                    className="h-9 w-9 bg-gradient-to-br from-sky-500 to-sky-400 rounded-full flex items-center justify-center text-white font-medium"
                    title={user?.email}
                  >
                    {userInitial}
                  </div>
                </div>
              </div>
            </header>

            {/* Page content */}
            <main className="p-4 lg:p-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
