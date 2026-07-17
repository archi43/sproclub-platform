import { Button } from "@/components/ui/button";

/** Sign-out control: a POST form so the action can't be triggered by prefetch. */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant="secondary" size="sm" className={className}>
        Se déconnecter
      </Button>
    </form>
  );
}
