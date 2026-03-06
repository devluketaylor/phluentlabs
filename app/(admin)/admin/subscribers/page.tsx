import { FormHeader } from "@/components/header";
import { Users } from "lucide-react";
import { SubscribersTable } from "@/components/admin/subscribers-table";

export default function SubscribersPage() {
    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-4">
                <FormHeader
                    icon={<Users />}
                    title="Manage Subscribers"
                    description="Manage newsletter subscribers below."
                />
                <SubscribersTable />
            </div>
        </div>
    );
}
