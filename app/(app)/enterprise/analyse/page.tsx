import { redirect } from "next/navigation";

export default function EnterpriseAnalyseRedirect() {
  redirect("/enterprise/reporting?tab=day");
}
