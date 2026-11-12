import { redirect } from "next/navigation";

/** Runs are now logged from the activity screen; old links land there. */
export default function RunPage() {
  redirect("/activity");
}
