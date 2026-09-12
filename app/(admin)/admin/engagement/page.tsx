import { FormHeader } from "@/components/header";
import { Activity } from "lucide-react";
import { EngagementView } from "@/components/admin/engagement-view";

export default function EngagementPage() {
    return (
        <div className="max-w-5xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-6">
                <FormHeader
                    icon={<Activity />}
                    title="Subscriber engagement"
                    description="Who's opening and clicking — and who's gone quiet. Spot your superfans and your win-back / list-hygiene candidates."
                />
                <EngagementView />
            </div>
        </div>
    );
}
