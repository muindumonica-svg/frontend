import { Link, createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { landingPathFor, loadSession, useLogin } from "@/api/hooks/auth";
import { loadCustomerSession, useCustomerLogin } from "@/api/hooks/public";
import { ApiError, fieldError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_public/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect:
      typeof search["redirect"] === "string" && search["redirect"].startsWith("/") ? search["redirect"] : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const customer = await loadCustomerSession().catch(() => null);
    if (customer) throw redirect({ to: search.redirect ?? "/account", replace: true });

    // A staff session signs in here too, so the form never hides an active login.
    const staff = await loadSession().catch(() => null);
    if (staff) throw redirect({ to: landingPathFor(staff), replace: true });
  },
  component: SignIn,
});

function loginBanner(error: unknown): string {
  if (!(error instanceof ApiError)) return "Sign in failed. Try again.";
  if (error.status === 401) return "Invalid email or password.";
  return error.message;
}

function SignIn() {
  const router = useRouter();
  const navigate = useNavigate();
  const { redirect: next } = Route.useSearch();
  const customerLogin = useCustomerLogin();
  const staffLogin = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    customerLogin.reset();
    staffLogin.reset();

    try {
      const account = await customerLogin.mutateAsync({ email, password });
      toast.success(`Karibu, ${account.name.split(" ")[0]}`);
      if (next) router.history.push(next);
      else router.history.push("/account");
      return;
    } catch (failure) {
      // Only "no customer with this email" falls through to a staff account.
      // A disabled, throttled or malformed request is a final answer.
      if (!(failure instanceof ApiError) || failure.status !== 401) return;
    }

    try {
      const session = await staffLogin.mutateAsync({ email, password });
      toast.success(`Karibu, ${session.user.name.split(" ")[0]}`);
      navigate({ to: landingPathFor(session), replace: true });
    } catch {
      // staffLogin.error carries the message the form renders below.
    }
  }

  // Hide the customer 401 while the staff fallback is still in flight.
  const error = staffLogin.error ?? (staffLogin.isPending ? null : customerLogin.error);
  const pending = customerLogin.isPending || staffLogin.isPending;
  const emailError = fieldError(error, "email");
  const passwordError = fieldError(error, "password");

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Customers manage orders and addresses here; staff go straight to their workspace.
      </p>

      <form onSubmit={signIn} className="mt-6 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="customer-email">Email</Label>
          <Input
            id="customer-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(emailError)}
          />
          {emailError && <p className="text-xs font-medium text-destructive">{emailError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-password">Password</Label>
          <Input
            id="customer-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(passwordError)}
          />
          {passwordError && <p className="text-xs font-medium text-destructive">{passwordError}</p>}
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loginBanner(error)}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        New here?{" "}
        <Link to="/account/register" className="font-semibold text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
