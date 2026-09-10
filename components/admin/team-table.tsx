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
import { Copy, Plus, Users } from "lucide-react";
import {
    ADMIN_ROLES,
    type AdminRole,
    ROLE_LABELS,
    canAssignRole,
    canManageMemberWithRole,
} from "@/lib/roles";

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
    const canManageTeam = actorRole === "owner";

    // Roles the current actor is allowed to grant.
    const assignableRoles = useMemo(
        () => (actorRole ? ADMIN_ROLES.filter((r) => canAssignRole(actorRole, r)) : []),
        [actorRole],
    );

    const [inviteOpen, setInviteOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [role, setRole] = useState<AdminRole>("editor");
    // The temp password is shown exactly once, right after invite.
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [invitedEmail, setInvitedEmail] = useState<string>("");

    const invite = trpc.adminTeam.invite.useMutation({
        onSuccess: (data) => {
            setTempPassword(data.tempPassword);
            setInvitedEmail(data.email);
            setEmail("");
            setName("");
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

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Copied to clipboard");
        } catch {
            toast.error("Couldn't copy — copy it manually");
        }
    };

    return (
        <div className="space-y-4">
            {canManageTeam && (
                <div className="flex items-center justify-end">
                    <Button
                        onClick={() => {
                            setTempPassword(null);
                            setEmail("");
                            setName("");
                            setRole(assignableRoles.includes("editor") ? "editor" : assignableRoles[0] ?? "viewer");
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

            {!canManageTeam && !list.isLoading && (
                <p className="text-xs text-muted-foreground">
                    Only owners can invite, re-role, or remove team members.
                </p>
            )}

            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{tempPassword ? "Share these credentials" : "Invite a team member"}</DialogTitle>
                        <DialogDescription>
                            {tempPassword
                                ? "This temporary password is shown only once. Share it securely — the member should change it after signing in."
                                : "Create a new admin account. They'll sign in with the email + temporary password you share."}
                        </DialogDescription>
                    </DialogHeader>

                    {tempPassword ? (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label>Email</Label>
                                <code className="block overflow-x-auto rounded bg-muted px-2 py-2 font-mono text-xs">
                                    {invitedEmail}
                                </code>
                            </div>
                            <div className="space-y-1">
                                <Label>Temporary password</Label>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-2 font-mono text-xs">
                                        {tempPassword}
                                    </code>
                                    <Button variant="secondary" size="sm" onClick={() => copy(tempPassword)}>
                                        <Copy className="size-4" />
                                    </Button>
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
                                <Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
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
                        {tempPassword ? (
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
