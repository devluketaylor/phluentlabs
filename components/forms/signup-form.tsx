"use client";

import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {z} from "zod";
import {useRouter} from "next/navigation";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {authClient} from "@/lib/auth-client";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";

const signUpSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters long")
})

type SignUpValues = z.infer<typeof signUpSchema>;

export const AuthAdminSignupForm = () => {
    const router = useRouter();

    const form = useForm<SignUpValues>({
        resolver: zodResolver(signUpSchema),
        defaultValues: { email: "", password: "" },
        mode: "onSubmit"
    });

    const onSubmit = async (values: SignUpValues) => {
        form.clearErrors("root")

        const { error } = await authClient.signUp.email({ email: values.email, password: values.password, name: values.name });

        if (error) {
            console.log("error", error)
            form.setError("root", { message: error.message ?? "Signup has failed" });
            return;
        }

        router.push("/");
        router.refresh();
    }

    return (
        <div>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className={"space-y-4"}>
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input placeholder={"Your name"} autoComplete={"name"} {...field} />
                            </FormControl>
                        </FormItem>
                    )} />

                    <FormField
                        control={form.control}
                        name={"email"}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <Input placeholder={"youremail@youremailprovider.com"} autoComplete={"email"} {...field} />
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
                                    <Input placeholder={""} autoComplete={"current-password"} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                    {form.formState.errors.root?.message && (
                        <p className={"text-sm text-destructive"}>{form.formState.errors.root.message}</p>
                    )}

                    <Button className={"w-full"} type={"submit"} disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? "Creating..." : "Create account"}
                    </Button>
                </form>
            </Form>
        </div>
    )
}