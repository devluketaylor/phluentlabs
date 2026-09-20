import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { FormHeader } from "@/components/header";
import { Radar } from "lucide-react";
import { auth } from "@/lib/auth";
import { isIdeaLabOwner } from "@/lib/idea-lab";
import { UsageView } from "@/components/admin/usage-view";

// PRIVATE: OpenClaw usage dashboard, hard-gated to Luke's email (same rule as
// the Idea Lab). Enforced here (page), in the tRPC router, and the link is only
// rendered for his email.
export default async function UsagePage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !isIdeaLabOwner((session.user as any).email)) {
        redirect("/admin/dashboard");
    }

    return (
        <div className="max-w-5xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-6">
                <FormHeader
                    icon={<Radar />}
                    title="Mission Control"
                    description="Command center for your OpenClaw bot fleet — agent activity (Tessie & Tiger), job health, live run feed, and token/cost spend. Cost is an estimate from a per-model rate table."
                />
                <UsageView />
            </div>
        </div>
    );
}
