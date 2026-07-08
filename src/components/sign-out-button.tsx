/** Sign-out control: a POST form so the action can't be triggered by prefetch. */
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post" style={{ margin: 0 }}>
      <button type="submit" style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}>
        Se déconnecter
      </button>
    </form>
  );
}
