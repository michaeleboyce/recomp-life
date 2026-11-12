import { redirectWithQuery, type RawSearchParams } from "@/components/nav/redirectWithQuery";

/** Old route, kept so bookmarks and in-app links keep working. */
export default async function ToolsRedirect({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  redirectWithQuery("/more", await searchParams);
}
