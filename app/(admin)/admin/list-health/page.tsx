import { FormHeader } from "@/components/header";
import { HeartPulse } from "lucide-react";
import { ListHealthView } from "@/components/admin/list-health-view";

export default function ListHealthPage() {
    return (
        <div className="max-w-5xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-6">
                <FormHeader
                    icon={<HeartPulse />}
                    title="List health"
                    description="Double opt-in funnel + stale-pending cleanup. Pending subscribers get one gentle confirm reminder automatically; cold leads are surfaced here for manual review — never auto-deleted."
                />
                <ListHealthView />
            </div>
        </div>
    );
}
