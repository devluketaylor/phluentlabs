import { FormHeader } from "@/components/header";
import { KeyRound } from "lucide-react";
import { ApiKeysTable } from "@/components/admin/api-keys-table";

export default function ApiKeysPage() {
    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-4">
                <FormHeader
                    icon={<KeyRound />}
                    title="API Keys"
                    description="Keys for the public subscribe API (POST /api/v1/subscribe). Raw keys are shown once at creation."
                />
                <ApiKeysTable />
            </div>
        </div>
    );
}
