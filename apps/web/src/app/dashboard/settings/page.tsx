import { redirect } from "next/navigation";
import { resolveUploadDefaults } from "~/fsd/entities/user";
import { getUserUploadDefaults } from "~/fsd/entities/user/server";
import SettingsView from "~/fsd/pages/settings/ui";
import { auth } from "~/server/auth";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const stored = await getUserUploadDefaults(session.user.id);

  return <SettingsView initialDefaults={resolveUploadDefaults(stored)} />;
}
