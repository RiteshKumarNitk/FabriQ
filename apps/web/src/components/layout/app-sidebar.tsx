'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Scissors } from 'lucide-react';
import { SIDEBAR_GROUPS } from '@/lib/entities';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export function AppSidebar() {
  const pathname = usePathname();
  const { user, has } = useAuth();

  // Sidebar items are permission-aware: platform items only for platform
  // admins, everything else gated by its read permission.
  const visibleGroups = SIDEBAR_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.isPlatform) return !!user?.isPlatformAdmin;
      if (item.permission) return has(item.permission);
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/5 bg-sidebar text-sidebar-foreground md:flex">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Scissors className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-semibold tracking-tight text-white">FabriQ</div>
          <div className="text-[11px] text-sidebar-foreground/60">Garment Manufacturing Platform</div>
        </div>
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/40">
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                        active
                          ? 'bg-primary/15 text-white'
                          : 'text-sidebar-foreground hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground')} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 px-6 py-4 text-[11px] text-sidebar-foreground/40">
        v0.1 · Platform Foundation
      </div>
    </aside>
  );
}
