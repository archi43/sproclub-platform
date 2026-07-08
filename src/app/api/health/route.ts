import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/tenant";

export async function GET() {
  const org = await getOrgContext();
  return NextResponse.json({ ok: true, org: org?.slug ?? null });
}
