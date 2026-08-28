import { redirect } from "next/navigation";

export default function EnterpriseStatistiquesRedirect() {
  redirect("/enterprise/reporting?tab=month");
}
