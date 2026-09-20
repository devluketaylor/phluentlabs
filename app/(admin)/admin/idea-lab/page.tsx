import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { FormHeader } from "@/components/header";
import { Lightbulb } from "lucide-react";
import { auth } from "@/lib/auth";
import { isIdeaLabOwner } from "@/lib/idea-lab";
import { IdeaLabView } from "@/components/admin/idea-lab-view";

// PRIVATE: Idea Lab is hard-gated to Luke's email. Even another owner/admin who
// somehow reaches this route is redirected away — the check is enforced here
// (page), in the tRPC router, and in the push endpoint.
export default async function IdeaLabPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !isIdeaLabOwner((session.user as any).email)) {
        redirect("/admin/dashboard");
    }

    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-6">
                <FormHeader
                    icon={<Lightbulb />}
                    title="Idea Lab"
                    description="Your private startup-idea feed. The research bot pushes scored ideas here; mark each Good or Bad and it learns your taste over time."
                />
                <IdeaLabView />
            </div>
        </div>
    );
}
