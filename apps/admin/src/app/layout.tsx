"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import './globals.css';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: string;
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/sites", label: "Sites", icon: "🌐" },
  { href: "/content", label: "Content", icon: "📝" },
  { href: "/seo", label: "SEO", icon: "🔍" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex flex-col h-full">
              {/* Logo */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-sky-400">holibob</span>
                  <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded">
                    Admin
                  </span>
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
                  const isActive = pathname === item.href ||
                    (item.href !== "/" && pathname?.startsWith(item.href));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-sky-600 text-white"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
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
                <button className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
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
                      {navItems.find((item) => pathname?.startsWith(item.href) || (item.href === "/" && pathname === "/"))?.label || "Dashboard"}
                    </span>
                  </nav>
                </div>

                <div className="flex items-center gap-3">
                  <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg relative">
                    🔔
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                  </button>
                  <div className="h-9 w-9 bg-gradient-to-br from-sky-500 to-sky-400 rounded-full flex items-center justify-center text-white font-medium">
                    A
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
