"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) return;
    setSubmitting(true);
    try {
      await login(username.trim() ? { username: username.trim(), password } : { secret: password });
      setUsername("");
      setPassword("");
      router.replace("/");
      router.refresh();
    } catch {
      toast.error("Sign-in failed. Check your credentials and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5" /> Sign in
          </CardTitle>
          <CardDescription>
            Use the configured username and password, or enter the local shared secret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <Input
              type="text"
              autoComplete="username"
              placeholder="Username (optional locally)"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting}
            />
            <Input
              autoFocus
              type="password"
              autoComplete="current-password"
              placeholder="Password or application secret"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
            />
            <Button className="w-full" type="submit" disabled={submitting || !password}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
