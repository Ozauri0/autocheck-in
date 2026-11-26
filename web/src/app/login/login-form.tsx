"use client";

import { useActionState } from "react";
import { Alert, button, Field, fieldProps } from "@/components/ui";
import { loginAction } from "@/lib/actions";
import type { FormState } from "@/lib/forms";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="next" value={next} />
      {state.message && <Alert>{state.message}</Alert>}
      <Field label="Email" name="email">
        <input
          {...fieldProps("email")}
          type="email"
          autoComplete="username"
          required
          defaultValue={state.values?.email}
        />
      </Field>
      <Field label="Contraseña" name="password">
        <input
          {...fieldProps("password")}
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <button type="submit" disabled={pending} className={`${button()} w-full`}>
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
