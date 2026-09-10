import { FormHeader } from "@/components/header";
import { ScrollText } from "lucide-react";
import { AuditTable } from "@/components/admin/audit-table";

export default function AuditPage() {
    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-4">
                <FormHeader
                    icon={<ScrollText />}
                    title="Audit Log"
                    description="Read-only trail of admin actions — who changed what, and when."
                />
                <AuditTable />
            </div>
        </div>
    );
}
