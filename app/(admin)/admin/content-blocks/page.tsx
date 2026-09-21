import { FormHeader } from "@/components/header";
import { Blocks } from "lucide-react";
import { ContentBlocksTable } from "@/components/admin/content-blocks-table";

export default function ContentBlocksPage() {
    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-4">
                <FormHeader
                    icon={<Blocks />}
                    title="Snippets"
                    description="Reusable content blocks — a header, sign-off, sponsor slot, or CTA — that you can insert into any issue from the editor's Snippets menu. Blocks are inserted as a copy, so editing one never changes issues you've already authored."
                />
                <ContentBlocksTable />
            </div>
        </div>
    );
}
