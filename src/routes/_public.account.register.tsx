import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { loadCustomerSession, useCustomerRegister } from "@/api/hooks/public";
import { fieldError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_public/account/register")({
  beforeLoad: async () => {
    const session = await loadCustomerSession().catch(() => null);
    if (session) throw redirect({ to: "/account", replace: true });
  },
  component: CustomerRegister,
});

function CustomerRegister() {
  const navigate = useNavigate();
  const register = useCustomerRegister();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    register.mutate(
      {
        name,
        email,
        phone: phone.trim() || null,
        password,
        password_confirmation: confirm,
      },
      {
        onSuccess: (account) => {
          toast.success(`Karibu, ${account.name.split(" ")[0]}`);
          navigate({ to: "/account", replace: true });
        },
      },
    );
  }

  const error = register.error;

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-2xl font-bold tracking-tight">Create an account</h1>
      <p className="mt-1 text-sm text-muted-foreground">Save delivery addresses and check out faster.</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        )}
        <Field label="Full name" id="customer-name" value={name} onChange={setName} error={fieldError(error, "name")} autoComplete="name" />
        <Field label="Email" id="customer-email" type="email" value={email} onChange={setEmail} error={fieldError(error, "email")} autoComplete="username" />
        <Field label="Phone (optional)" id="customer-phone" value={phone} onChange={setPhone} error={fieldError(error, "phone")} autoComplete="tel" />
        <Field
          label="Password"
          id="customer-new-password"
          type="password"
          value={password}
          onChange={setPassword}
          error={fieldError(error, "password")}
          autoComplete="new-password"
          hint="At least 8 characters"
        />
        <Field
          label="Confirm password"
          id="customer-confirm-password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          error={fieldError(error, "password_confirmation")}
          autoComplete="new-password"
        />

        <Button type="submit" className="w-full" disabled={register.isPending}>
          {register.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  hint,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  type?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
      />
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
