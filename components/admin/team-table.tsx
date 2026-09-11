"use client";

import { trpc } from "@/trpc/client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Plus, Users } from "lucide-react";
import {
    ADMIN_ROLES,
    type AdminRole,
    ROLE_LABELS,
    canAssignRole,
    canInvite,
    canManageMemberWithRole,
    invitableRolesFor,
    type InvitableRole,
} from "@/lib/roles";
import { Mail } from "lucide-react";

function formatWhen(value: unknown) {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
}

function RoleBadge({ role }: { role: AdminRole }) {
    const isOwner = role === "owner";
    return (
        <span
            className={
                isOwner
                    ? "inline-flex items-center rounded-full border border-[#ff5c5c]/40 bg-[#ff5c5c]/10 px-2 py-0.5 text-xs font-medium text-[#ff5c5c]"
                    : "inline-flex items-center rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            }
        >
            {ROLE_LABELS[role]}
        </span>
    );
}

export const TeamTable = () => {
    const utils = trpc.useUtils();
    const list = trpc.adminTeam.list.useQuery();

    const actorRole = list.data?.actorRole;
    const actorId = list.data?.actorId;
    const members = useMemo(() => list.data?.members ?? [], [list.data]);
    // Owners AND admins can invite; only owners can re-role/remove members.
    const canManageTeam = actorRole === "owner";
    const canInviteMembers = actorRole ? canInvite(actorRole) : false;

    // Roles the current actor is allowed to grant via an INVITE. `owner` is
    // never in this list (it's a single, non-transferable role), so the UI can
    // never offer it. Admins are capped at `admin`.
    const assignableRoles = useMemo(
        () => (actorRole ? invitableRolesFor(actorRole) : []),
        [actorRole],
    );

    const [inviteOpen, setInviteOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [role, setRole] = useState<InvitableRole>("editor");
    // After a successful invite we show a "sent" confirmation (the temp password
    // travels by email and is never shown in the UI).
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [sentOk, setSentOk] = useState<boolean>(true);

    const invite = trpc.adminTeam.invite.useMutation({
        onSuccess: (data) => {
            setSentTo(data.email);
            setSentOk(data.emailSent);
            setEmail("");
            setName("");
            if (data.emailSent) {
                toast.success(`Invite emailed to ${data.email}`);
            } else {
                toast.error(
                    data.emailError
                        ? `Member created, but the invite email failed: ${data.emailError}`
                        : "Member created, but the invite email failed to send.",
                );
            }
            void utils.adminTeam.list.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const updateRole = trpc.adminTeam.updateRole.useMutation({
        onSuccess: () => {
            toast.success("Role updated");
            void utils.adminTeam.list.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const remove = trpc.adminTeam.remove.useMutation({
        onSuccess: () => {
            toast.success("Member removed");
            void utils.adminTeam.list.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <div className="space-y-4">
            {canInviteMembers && (
                <div className="flex items-center justify-end">
                    <Button
                        onClick={() => {
                            setSentTo(null);
                            setEmail("");
                            setName("");
                            setRole(
                                assignableRoles.includes("editor")
                                    ? "editor"
                                    : assignableRoles[0] ?? "viewer",
                            );
                            setInviteOpen(true);
                        }}
                    >
                        <Plus className="size-4" />
                        Invite member
                    </Button>
                </div>
            )}

            <Card className="overflow-hidden">
                <div className="max-h-[70vh] overflow-auto">
                    <div className="min-w-[640px]">
                        <Table>
                            <TableHeader stickyHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead className="w-[190px]">Role</TableHead>
                                    <TableHead className="w-[140px]">Joined</TableHead>
                                    {canManageTeam && (
                                        <TableHead className="w-[110px] text-right">Actions</TableHead>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {members.map((m) => {
                                    const isSelf = m.id === actorId;
                                    const manageable =
                                        canManageTeam &&
                                        !isSelf &&
                                        actorRole != null &&
                                        canManageMemberWithRole(actorRole, m.role as AdminRole);
                                    return (
                                        <TableRow key={m.id}>
                                            <TableCell className="font-medium">
                                                {m.name}
                                                {isSelf && (
                                                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{m.email}</TableCell>
                                            <TableCell>
                                                {manageable ? (
                                                    <Select
                                                        value={m.role as AdminRole}
                                                        onValueChange={(v) =>
                                                            updateRole.mutate({
                                                                userId: m.id,
                                                                role: v as AdminRole,
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger className="h-8 w-[140px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {ADMIN_ROLES.filter(
                                                                (r) =>
                                                                    r === (m.role as AdminRole) ||
                                                                    (actorRole != null && canAssignRole(actorRole, r)),
                                                            ).map((r) => (
                                                                <SelectItem key={r} value={r}>
                                                                    {ROLE_LABELS[r]}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <RoleBadge role={m.role as AdminRole} />
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-muted-foreground">
                                                {formatWhen(m.createdAt)}
                                            </TableCell>
                                            {canManageTeam && (
                                                <TableCell className="text-right">
                                                    {manageable && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-destructive hover:text-destructive"
                                                            onClick={() => {
                                                                if (
                                                                    confirm(
                                                                        `Remove ${m.email} from the team? They'll lose admin access.`,
                                                                    )
                                                                )
                                                                    remove.mutate({ userId: m.id });
                                                            }}
                                                            disabled={remove.isPending}
                                                        >
                                                            Remove
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {!list.isLoading && members.length === 0 && !list.error && (
                    <div className="flex flex-col items-center gap-1 p-12 text-center">
                        <Users className="size-6 text-muted-foreground" />
                        <div className="text-sm font-medium">No team members yet</div>
                    </div>
                )}

                {list.isLoading && (
                    <div className="space-y-2 p-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                                <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                            </div>
                        ))}
                    </div>
                )}

                {list.error && <div className="p-4 text-sm text-destructive">{list.error.message}</div>}
            </Card>

            {!canInviteMembers && !list.isLoading && (
                <p className="text-xs text-muted-foreground">
                    Only owners and admins can invite team members. Re-roling and removing
                    members is owner-only.
                </p>
            )}

            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{sentTo ? "Invitation sent" : "Invite a team member"}</DialogTitle>
                        <DialogDescription>
                            {sentTo
                                ? "We've emailed them a temporary password. They'll be asked to set a new one the first time they sign in."
                                : "Create a new admin account. We'll email them a temporary password — they'll set their own on first sign-in."}
                        </DialogDescription>
                    </DialogHeader>

                    {sentTo ? (
                        <div className="space-y-3">
                            <div className="flex items-start gap-3 rounded-md border p-3">
                                <Mail className="mt-0.5 size-5 text-[#ff5c5c]" />
                                <div className="space-y-1 text-sm">
                                    {sentOk ? (
                                        <>
                                            <p className="font-medium">Invite emailed</p>
                                            <p className="text-muted-foreground">
                                                A temporary password was sent to{" "}
                                                <span className="font-mono">{sentTo}</span>. They'll be forced
                                                to change it on first login.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="font-medium text-destructive">
                                                Account created, email failed
                                            </p>
                                            <p className="text-muted-foreground">
                                                We couldn't email{" "}
                                                <span className="font-mono">{sentTo}</span>. You can remove and
                                                re-invite them to try again.
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <Label htmlFor="team-name">Name</Label>
                                <Input
                                    id="team-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Jane Doe"
                                    maxLength={120}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="team-email">Email</Label>
                                <Input
                                    id="team-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="jane@example.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Role</Label>
                                <Select value={role} onValueChange={(v) => setRole(v as InvitableRole)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {assignableRoles.map((r) => (
                                            <SelectItem key={r} value={r}>
                                                {ROLE_LABELS[r]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {sentTo ? (
                            <Button onClick={() => setInviteOpen(false)}>Done</Button>
                        ) : (
                            <>
                                <Button variant="secondary" onClick={() => setInviteOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() =>
                                        invite.mutate({ email: email.trim(), name: name.trim(), role })
                                    }
                                    disabled={!email.trim() || !name.trim() || invite.isPending}
                                >
                                    {invite.isPending ? "Inviting…" : "Invite"}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
