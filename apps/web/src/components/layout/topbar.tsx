'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, LogOut, User } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { http } from '@/lib/api';
import { initials, titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Topbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    try {
      const res = await http.get<{ count: number }>('/notifications/unread-count');
      setUnread(res.count);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadUnread();
    const t = setInterval(loadUnread, 60_000);
    return () => clearInterval(t);
  }, [loadUnread]);

  const segment = pathname.split('/').filter(Boolean);
  const title =
    segment.length >= 2 && segment[0] === 'admin'
      ? titleCase(segment[1].replace(/-/g, ' '))
      : segment.length > 0
        ? titleCase(segment[0])
        : 'Dashboard';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <div>
        <h1 className="text-sm font-semibold">{title}</h1>
        <p className="hidden text-xs text-muted-foreground sm:block">
          {user?.email}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild className="relative">
          <Link href="/notifications" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {initials(user?.firstName, user?.lastName)}
              </span>
              <span className="hidden max-w-32 truncate text-sm sm:block">
                {user?.firstName} {user?.lastName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <div className="px-2 pb-1 pt-2">
              {user?.roles.map((role) => (
                <Badge key={role} variant="secondary" className="mr-1 mb-0.5">
                  {role.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()}>
              <LogOut className="text-muted-foreground" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
