import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import heroImg from "@/assets/brand-hero.jpg";
import { landingPathFor, loadSession, useLogin } from "@/api/hooks/auth";
import { ApiError, csrfReady, fieldError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/staff/login")({
  component: Login,
});

/** Banner copy the cashier can act on; a 401 stays generic so accounts are not probed. */
function loginBanner(error: unknown): string {
  if (!(error instanceof ApiError)) return "Sign in failed. Try again.";
  if (error.status === 401) return "Invalid email or password.";
  return error.message;
}

function Login() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let active = true;

    // Warm both requests without making the sign-in form wait for the network.
    void csrfReady().catch(() => undefined);
    void loadSession()
      .then((session) => {
        if (active && session) {
          void navigate({ to: landingPathFor(session), replace: true });
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [navigate]);

  function signIn(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: (session) => {
          toast.success(`Karibu, ${session.user.name}`);
          navigate({ to: landingPathFor(session), replace: true });
        },
      },
    );
  }

  const emailError = fieldError(login.error, "email");
  const passwordError = fieldError(login.error, "password");

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden lg:flex lg:w-[45%] flex-col justify-end overflow-hidden pos-theme">
        <img
          src={heroImg}
          alt="Fresh BrathaMatu poultry"
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-pos-bg via-pos-bg/40 to-transparent" />
        <div className="relative z-10 p-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-pos-border bg-pos-surface/80 px-3 py-1 text-xs font-semibold tracking-widest text-brand">
            SALES · STOCK · M-PESA
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-pos-foreground">
            BRATHAMATU
          </h1>
          <p className="mt-2 max-w-sm text-sm text-pos-muted-foreground">
            Premium poultry POS, inventory and business management. Fresh stock, fast sales, honest
            books.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:text-left">
            <img
              src="/pwa/icon-96.png"
              alt="BrathaMatu"
              width={56}
              height={56}
              className="mb-3 inline-block h-14 w-14 rounded-2xl shadow-elegant"
            />
            <h2 className="font-display text-2xl font-bold">Staff sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">Kuku POS · Staff access</p>
          </div>

          <form onSubmit={signIn} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@brathamatu.co.ke"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(emailError)}
                className="h-12"
              />
              {emailError && <p className="text-xs font-medium text-destructive">{emailError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(passwordError)}
                className="h-12"
              />
              {passwordError && (
                <p className="text-xs font-medium text-destructive">{passwordError}</p>
              )}
            </div>

            {login.error && !emailError && !passwordError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
              >
                {loginBanner(login.error)}
              </p>
            )}

            <Button
              type="submit"
              disabled={login.isPending}
              className="h-12 w-full text-base font-semibold"
            >
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm">
            <Link
              to="/"
              className="font-semibold text-foreground underline-offset-4 hover:underline"
            >
              ← Back to the storefront
            </Link>
          </p>

          <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
            Accounts are created by a manager or the super admin. If you cannot sign in, ask them to
            confirm your email, your branch and that your account is still active.
          </p>
        </div>
      </div>
    </div>
  );
}
