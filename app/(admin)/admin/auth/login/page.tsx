"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";

export default function AdminLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [pending, setPending] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setPending(true);

        const { error } = await signIn.email({ email, password });

        if (error) {
            setError(error.message ?? "Invalid credentials");
            setPending(false);
            return;
        }

        router.push("/admin");
    };

    return (
        <main className="mx-auto max-w-sm p-6 mt-20">
            <h1 className="text-2xl font-bold mb-6">Admin Login</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full border rounded px-3 py-2 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full border rounded px-3 py-2 text-sm"
                    />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                    type="submit"
                    disabled={pending}
                    className="w-full bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50"
                >
                    {pending ? "Signing in..." : "Sign in"}
                </button>
            </form>
        </main>
    );
}
