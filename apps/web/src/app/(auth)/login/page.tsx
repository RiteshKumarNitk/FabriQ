'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Scissors, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sidebar" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Enter your email and password');
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      toast.error((err as Error).message ?? 'Login failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sidebar p-4">
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Scissors className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">FabriQ</h1>
            <p className="text-xs text-white/50">Garment Manufacturing Platform</p>
          </div>
        </div>

        <Card className="shadow-2xl">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              {searchParams.get('from')
                ? 'You need to sign in to continue.'
                : 'Access your tenant workspace.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="owner@acme.test"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-6 rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Demo credentials</p>
              <p>
                Platform admin: <code className="font-mono">admin@fabriq.local / Admin@123</code>
              </p>
              <p>
                Tenant admin: <code className="font-mono">owner@acme.test / Demo@123</code>
              </p>
              <p>
                Factory manager: <code className="font-mono">manager@acme.test / Demo@123</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
