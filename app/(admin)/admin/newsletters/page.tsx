import { FormHeader } from "@/components/header";
import { Newspaper } from "lucide-react";
import { NewslettersTable } from "@/components/admin/newsletters-table";

export default function NewslettersPage() {
    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-4">
                <FormHeader
                    icon={<Newspaper />}
                    title="Manage Newsletters"
                    description="Edit, change status, or delete existing newsletter issues."
                />
                <NewslettersTable />
            </div>
        </div>
    );
}
