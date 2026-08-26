import { Button } from "@/components/ui/button";

/** Sign-out control: a POST form so the action can't be triggered by prefetch.
 *  `variant` suit le ton de la coque (navy ou claire). */
export function SignOutButton({ className, variant = "secondary" }: {
  className?: string;
  variant?: "secondary" | "shell";
}) {
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant={variant} size="sm" className={className}>
        Se déconnecter
      </Button>
    </form>
  );
}
