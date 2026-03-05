"use client";

import {useSearchParams} from "next/navigation";
import {trpc} from "@/trpc/client";
import {useEffect} from "react";
import {FormHeader} from "@/components/header";
import {Inbox} from "lucide-react";

const ConfirmPage = () => {
    const params = useSearchParams();
    const token = params.get("token") ?? "";

    const confirm = trpc.subscribe.confirm.useMutation();

    useEffect(() => {
        if (!token) return;
        confirm.mutate({ token })
    }, [token]);

    if (!token) return <FormHeader icon={<Inbox />} title={"Confirm you email"} description={"Check you inbox and verify your email."} />
    if (confirm.isPending) return <p>Confirming...</p>
    if (confirm.isError) return <p>Invalid or expired link.</p>
    return <p>You're subscribed!</p>
}

export default ConfirmPage;