"use client"

import {trpc} from "@/trpc/client";
import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button";
import {SelectItem} from "@radix-ui/react-select";
import {Select, SelectContent, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {Card} from "@/components/ui/card";

type Status = "pending" | "subscribed" | "unsubscribed";

export const SubscribersTable = () => {
    const utils = trpc.useUtils();
    const [q, setQ] = useState("")
    const [status, setStatus] = useState<Status | "all">("all");

    const list = trpc.adminSubscribers.list.useQuery({
        q: q.trim() || undefined,
        status: status === "all" ? undefined : status,
        limit: 100,
        offset: 0
    });

    const update = trpc.adminSubscribers.update.useMutation({
        onSuccess: async () => {
            await utils.adminSubscribers.list.invalidate();
        }
    })

    const del = trpc.adminSubscribers.delete.useMutation({
        onSuccess: async () => {
            await utils.adminSubscribers.list.invalidate();
        }
    })

        return (
        <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
    value={q}
    onChange={(e) => setQ(e.target.value)}
    placeholder="Search email / name…"
    className="sm:w-[280px]"
        />

        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
<SelectTrigger className="sm:w-[200px]">
        <SelectValue placeholder="Filter status" />
        </SelectTrigger>
    <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="pending">Pending</SelectItem>
        <SelectItem value="subscribed">Subscribed</SelectItem>
        <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
    </SelectContent>
</Select>
</div>

    <Button variant="secondary" onClick={() => list.refetch()} disabled={list.isFetching}>
        {list.isFetching ? "Refreshing…" : "Refresh"}
    </Button>
</div>

    <Card className="overflow-hidden">
        <div className="grid grid-cols-12 gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-5">Email</div>
            <div className="col-span-2">First</div>
            <div className="col-span-2">Last</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Actions</div>
        </div>

        {list.data?.map((s) => (
            <div key={s.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b">
                <div className="col-span-5 truncate text-sm">{s.email}</div>
                <div className="col-span-2 truncate text-sm text-muted-foreground">{s.firstName ?? "—"}</div>
                <div className="col-span-2 truncate text-sm text-muted-foreground">{s.lastName ?? "—"}</div>
                <div className="col-span-2 text-sm">{s.status}</div>
                <div className="col-span-1 flex justify-end gap-2">
                    <EditSubscriberDialog
                        subscriber={s}
                        onSave={(next) => update.mutate(next)}
                        saving={update.isPending}
                    />
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => del.mutate({ id: s.id })}
                        disabled={del.isPending}
                    >
                        Delete
                    </Button>
                </div>
            </div>
        ))}

        {!list.isLoading && (list.data?.length ?? 0) === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">No subscribers found.</div>
        )}

        {list.isLoading && (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        )}

        {list.error && (
            <div className="p-4 text-sm text-destructive">{list.error.message}</div>
        )}
    </Card>
</div>
        )
}

function EditSubscriberDialog({
                                  subscriber,
                                  onSave,
                                  saving,
                              }: {
    subscriber: any;
    onSave: (input: { id: string; email: string; firstName: string | null; lastName: string | null; status: Status }) => void;
    saving: boolean;
}) {
    const [open, setOpen] = useState(false);

    const [email, setEmail] = useState(subscriber.email);
    const [firstName, setFirstName] = useState(subscriber.firstName ?? "");
    const [lastName, setLastName] = useState(subscriber.lastName ?? "");
    const [status, setStatus] = useState<Status>(subscriber.status);

    useEffect(() => {
        if (!open) return;
        setEmail(subscriber.email);
        setFirstName(subscriber.firstName ?? "");
        setLastName(subscriber.lastName ?? "");
        setStatus(subscriber.status);
    }, [open, subscriber]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="secondary">Edit</Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit subscriber</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Email</div>
                        <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <div className="text-sm font-medium">First name</div>
                            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Last name</div>
                            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">Status</div>
                        <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="subscribed">Subscribed</SelectItem>
                                <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => {
                                onSave({
                                    id: subscriber.id,
                                    email,
                                    firstName: firstName.trim() ? firstName.trim() : null,
                                    lastName: lastName.trim() ? lastName.trim() : null,
                                    status,
                                });
                                setOpen(false);
                            }}
                            disabled={saving || !email.trim()}
                        >
                            Save
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}