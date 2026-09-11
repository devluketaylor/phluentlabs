"use client";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trpc } from "@/trpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const schema = z
    .object({
        currentPassword: z.string().min(1, "Enter your temporary password"),
        newPassword: z.string().min(8, "Password must be at least 8 characters long"),
        confirmPassword: z.string().min(8, "Confirm your new password"),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
        path: ["confirmPassword"],
        message: "Passwords don't match",
    })
    .refine((v) => v.newPassword !== v.currentPassword, {
        path: ["newPassword"],
        message: "Choose a password different from the temporary one",
    });

type Values = z.infer<typeof schema>;

export const ChangePasswordForm = () => {
    const router = useRouter();

    const form = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
        mode: "onSubmit",
    });

    const changePassword = trpc.adminTeam.changeInitialPassword.useMutation({
        onSuccess: () => {
            toast.success("Password updated — welcome aboard!");
            // Flag is cleared server-side; land in the admin panel.
            router.push("/admin");
            router.refresh();
        },
        onError: (e) => {
            form.setError("root", { message: e.message ?? "Couldn't update your password" });
        },
    });

    const onSubmit = (values: Values) => {
        form.clearErrors("root");
        changePassword.mutate({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
        });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className={"space-y-4"}>
                <FormField
                    control={form.control}
                    name={"currentPassword"}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Temporary password</FormLabel>
                            <FormControl>
                                <Input
                                    type={"password"}
                                    autoComplete={"current-password"}
                                    placeholder={"From your invite email"}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name={"newPassword"}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>New password</FormLabel>
                            <FormControl>
                                <Input type={"password"} autoComplete={"new-password"} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name={"confirmPassword"}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Confirm new password</FormLabel>
                            <FormControl>
                                <Input type={"password"} autoComplete={"new-password"} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {form.formState.errors.root?.message && (
                    <p className={"text-sm text-destructive"}>{form.formState.errors.root.message}</p>
                )}

                <Button className={"w-full"} type={"submit"} disabled={changePassword.isPending}>
                    {changePassword.isPending ? "Updating…" : "Set new password & continue"}
                </Button>
            </form>
        </Form>
    );
};
