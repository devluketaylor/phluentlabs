"use client";

import { useState } from "react";
import { NewsletterRichEditor } from "@/components/admin/newsletter-rich-editor";
import {FormHeader} from "@/components/header";
import {MailPlus} from "lucide-react";

const AdminPage = () => {
    const [html, setHtml] = useState("<p></p>");

    return (
        <div className="max-w-5xl mx-auto pt-12">
            <div className={"space-y-4"}>
            <FormHeader icon={<MailPlus />} title={"Create a newsletter issues"} description={"Fill out the details below to create a new newsletter issue."} />
            <NewsletterRichEditor
                value={html}
                onChange={setHtml}
                placeholder="Write the email body"
            />
            </div>
        </div>
    );
};

export default AdminPage;