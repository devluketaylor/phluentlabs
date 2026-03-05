"use client";

import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {z} from "zod";
import {useRouter} from "next/navigation";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {authClient} from "@/lib/auth-client";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {auth} from "@/lib/auth";
import {Info} from "lucide-react";
import Link from "next/link";

const loginSchema = z.object({
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters long")
})

type LoginValues = z.infer<typeof loginSchema>;

export const AuthLoginForm = () => {
    const router = useRouter();

    const form = useForm<LoginValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: "", password: "" },
        mode: "onSubmit"
    });

    const onSubmit = async (values: LoginValues) => {
        form.clearErrors("root")

        const { error } = await authClient.signIn.email({ email: values.email, password: values.password });

        if (error) {
            console.log("error", error)
            form.setError("root", { message: error.message ?? "Login has failed" });
            return;
        }

        router.push("/");
        router.refresh();
    }

    return (
        <div>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className={"space-y-4"}>
                    <FormField
                        control={form.control}
                        name={"email"}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <Input placeholder={"youremail@email.com"} autoComplete={"email"} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                    <FormField
                        control={form.control}
                        name={"password"}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                    <Input placeholder={""} type={"password"} autoComplete={"current-password"} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                    {form.formState.errors.root?.message && (
                        <p className={"text-sm text-destructive"}>{form.formState.errors.root.message}</p>
                    )}

                    <Button className={"w-full"} type={"submit"} disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? "Logging in..." : "Log in"}
                    </Button>
                    <p className={"flex items-center gap-2 text-muted-foreground text-sm"}>Do not have an account?<Link href={"/auth/signup"} className={"hover:underline transition-all"}>Signup</Link></p>
                </form>
            </Form>
        </div>
    )
}