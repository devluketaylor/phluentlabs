import { FormHeader } from "@/components/header";
import { Users } from "lucide-react";
import { TeamTable } from "@/components/admin/team-table";

export default function TeamPage() {
    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-4">
                <FormHeader
                    icon={<Users />}
                    title="Team"
                    description="Manage admin access. Owners can invite members, change roles, and remove access. Roles: Owner, Admin, Editor, Viewer."
                />
                <TeamTable />
            </div>
        </div>
    );
}
