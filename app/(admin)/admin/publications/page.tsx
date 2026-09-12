import { FormHeader } from "@/components/header";
import { Layers } from "lucide-react";
import { PublicationsTable } from "@/components/admin/publications-table";

export default function PublicationsPage() {
    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-4">
                <FormHeader
                    icon={<Layers />}
                    title="Publications"
                    description="Run more than one newsletter stream with per-publication opt-in. The primary stream reaches every confirmed subscriber; non-primary streams reach only opted-in subscribers."
                />
                <PublicationsTable />
            </div>
        </div>
    );
}
