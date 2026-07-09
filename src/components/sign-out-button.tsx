import { Button } from "@/components/ui/button";

/** Sign-out control: a POST form so the action can't be triggered by prefetch. */
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant="secondary" size="sm">
        Se déconnecter
      </Button>
    </form>
  );
}
