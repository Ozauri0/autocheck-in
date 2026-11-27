import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { UsersPanel } from "@/components/users-panel";
import { api } from "@/lib/api";
import { load } from "@/lib/load";
import { getMe, requireAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage() {
  await requireAdmin();
  const { data, error } = await load(async () => ({
    users: await api.listUsers(),
    me: await getMe(),
  }));

  if (error !== undefined) {
    return (
      <Alert>
        {error}{" "}
        <Link href="/usuarios" className="underline">
          Reintentar
        </Link>
      </Alert>
    );
  }
  return <UsersPanel users={data.users} selfId={data.me.id} />;
}
