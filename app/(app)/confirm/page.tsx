"use client";

import { Suspense } from "react";
import {useSearchParams} from "next/navigation";
import {trpc} from "@/trpc/client";
import {useEffect} from "react";
import {FormHeader} from "@/components/header";
import {Check, Inbox, XIcon} from "lucide-react";

function ConfirmContent() {
    const params = useSearchParams();
    const token = params.get("token") ?? "";

    const confirm = trpc.subscribe.confirm.useMutation();

    useEffect(() => {
        if (!token) return;
        confirm.mutate({ token })
    }, [token]);

    if (!token) return <div className={"mx-auto flex justify-center pt-12"}><FormHeader icon={<Inbox />} title={"Confirm you email"} description={"Check you inbox and verify your email."} /></div>
    if (confirm.isPending) return <p className={"text-center pt-12"}>Confirming...</p>
    if (confirm.isError) return <div className={"mx-auto flex justify-center pt-12"}><FormHeader icon={<XIcon/>} title={"Invalid or expired link"} description={"This link has expired, try subscribing again."} /></div>
    return <div className={"mx-auto flex justify-center pt-12"}><FormHeader icon={<Check />} title={"Success you're verified"} description={"You will now recieve our weekly newsletter!"} /></div>
}

export default function ConfirmPage() {
    return (
        <Suspense fallback={<p className={"text-center pt-12"}>Loading...</p>}>
            <ConfirmContent />
        </Suspense>
    );
}