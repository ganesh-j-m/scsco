"use client";

import { SignIn, SignOutButton, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const LoginPage = () => {
  const { isLoaded, isSignedIn, user } = useUser();
  const [role, setRole] = useState<string>();

  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) {
      return;
    }

    let cancelled = false;

    user.reload().then((refreshedUser) => {
      if (cancelled) {
        return;
      }

      const publicRole = refreshedUser.publicMetadata.role;
      const refreshedRole = typeof publicRole === "string" ? publicRole : undefined;
      if (typeof refreshedRole === "string" && refreshedRole) {
        setRole(refreshedRole);
        router.replace(`/${refreshedRole}`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lamaSkyLight">
        <p className="text-gray-500">Loading account...</p>
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lamaSkyLight">
        <div className="bg-white p-8 rounded-md shadow-2xl flex flex-col gap-4">
          <h1 className="text-xl font-bold">
            {role ? "Opening your dashboard..." : "Account role is missing"}
          </h1>
          <p className="text-gray-500">
            {role
              ? `Signed in as ${role}.`
              : "Add a role in Clerk Public metadata, then sign in again."}
          </p>
          <SignOutButton>
            <button className="bg-blue-500 text-white rounded-md p-2">
              Sign out
            </button>
          </SignOutButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-lamaSkyLight">
      <SignIn />
    </div>
  );
};

export default LoginPage;
