import { FormHeader } from "@/components/header";
import { MessagesSquare } from "lucide-react";
import { FeedbackTable } from "@/components/admin/feedback-table";

export default function FeedbackPage() {
    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-4">
                <FormHeader
                    icon={<MessagesSquare />}
                    title="Reader Feedback"
                    description="Notes readers sent via the public feedback form and the reply prompt in each issue."
                />
                <FeedbackTable />
            </div>
        </div>
    );
}
