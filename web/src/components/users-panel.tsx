"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { deleteUserAction, saveUserAction } from "@/lib/actions";
import type { FormState } from "@/lib/forms";
import type { User } from "@/lib/types";
import { ConfirmDelete } from "./confirm-delete";
import { Modal } from "./modal";
import { Alert, Badge, button, card, Field, fieldProps, td, th, thead } from "./ui";

const ROLE_LABELS = { admin: "Administrador", ayudante: "Ayudante" };

export function UsersPanel({ users, selfId }: { users: User[]; selfId: string }) {
  // null: cerrado · "new": creación · User: edición
  const [editing, setEditing] = useState<User | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">Usuarios</h1>
        <button type="button" onClick={() => setEditing("new")} className={button()}>
          <Plus aria-hidden className="size-4" />
          Nuevo usuario
        </button>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <caption className="sr-only">Usuarios del panel</caption>
          <thead className={thead}>
            <tr>
              <th className={th}>Nombre</th>
              <th className={th}>Email</th>
              <th className={th}>Rol</th>
              <th className={th}>Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className={`${td} min-w-40 font-medium text-navy`}>
                  {u.name}
                  {u.id === selfId && <span className="font-normal text-slate-500"> (usted)</span>}
                </td>
                <td className={td}>{u.email}</td>
                <td className={td}>
                  <Badge tone={u.role === "admin" ? "green" : "gray"}>{ROLE_LABELS[u.role]}</Badge>
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(u)}
                      className={button("ghost", "sm")}
                      aria-label={`Editar ${u.email}`}
                      title="Editar"
                    >
                      <Pencil aria-hidden className="size-4" />
                    </button>
                    <ConfirmDelete
                      title="Eliminar usuario"
                      label={`Eliminar ${u.email}`}
                      action={() => deleteUserAction(u.id)}
                      warning={
                        <p>
                          ¿Eliminar a <strong>{u.name}</strong> ({u.email})? Perderá el acceso de
                          inmediato.
                        </p>
                      }
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal
          title={editing === "new" ? "Nuevo usuario" : "Editar usuario"}
          onClose={() => setEditing(null)}
        >
          <UserForm
            user={editing === "new" ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function UserForm({ user, onDone }: { user?: User; onDone: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await saveUserAction(prev, form);
    if (result.ok) onDone();
    return result;
  }, {});
  const { errors = {}, values } = state;

  return (
    <form action={action} noValidate className="space-y-4">
      {user && <input type="hidden" name="id" value={user.id} />}
      {state.message && <Alert>{state.message}</Alert>}
      <Field label="Nombre *" name="name" error={errors.name}>
        <input
          {...fieldProps("name", errors.name)}
          required
          defaultValue={values?.name ?? user?.name}
        />
      </Field>
      <Field label="Email *" name="email" error={errors.email}>
        <input
          {...fieldProps("email", errors.email)}
          type="email"
          autoComplete="off"
          required
          defaultValue={values?.email ?? user?.email}
        />
      </Field>
      <Field label="Rol" name="role" hint="El ayudante solo puede escanear códigos QR.">
        {/* La key repone la selección cuando React reinicia el formulario. */}
        <select
          {...fieldProps("role")}
          key={values?.role}
          defaultValue={values?.role ?? user?.role ?? "ayudante"}
        >
          <option value="ayudante">{ROLE_LABELS.ayudante}</option>
          <option value="admin">{ROLE_LABELS.admin}</option>
        </select>
      </Field>
      <Field
        label={user ? "Nueva contraseña" : "Contraseña *"}
        name="password"
        error={errors.password}
        hint={user ? "Déjela vacía para no cambiarla." : "Mínimo 4 caracteres."}
      >
        <input
          {...fieldProps("password", errors.password)}
          type="password"
          autoComplete="new-password"
          required={!user}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={button("secondary")}>
          Cancelar
        </button>
        <button type="submit" disabled={pending} className={button()}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
